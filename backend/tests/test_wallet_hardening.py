from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest
from contextlib import ExitStack
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.api import app  # noqa: E402
from src.feature_builder import LIVE_FEATURE_COLUMNS  # noqa: E402
from src.predict_wallet import (  # noqa: E402
    _get_cached_feature_row,
    get_feature_store_column_map,
    load_feature_columns,
    load_feature_importance,
    load_model,
)
from src.wallet_analysis_service import _analyze_wallet_cached  # noqa: E402

BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def make_tx(txid: str, inputs, outputs, *, fee: int = 1500, block_height: int = 840_000, block_time: int = 1_700_000_000):
    return {
        "txid": txid,
        "vin": [
            {
                "prevout": {
                    "scriptpubkey_address": address,
                    "value": value,
                }
            }
            for address, value in inputs
        ],
        "vout": [
            {
                "scriptpubkey_address": address,
                "value": value,
            }
            for address, value in outputs
        ],
        "fee": fee,
        "status": {
            "confirmed": True,
            "block_height": block_height,
            "block_time": block_time,
        },
    }


def contains_invalid_numbers(value) -> bool:
    if isinstance(value, float):
        return math.isnan(value) or math.isinf(value)
    if isinstance(value, dict):
        return any(contains_invalid_numbers(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_invalid_numbers(item) for item in value)
    return False


def _bech32_polymod(values):
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    checksum = 1
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1FFFFFF) << 5) ^ value
        for index in range(5):
            if (top >> index) & 1:
                checksum ^= generator[index]
    return checksum


def _bech32_hrp_expand(hrp):
    return [ord(char) >> 5 for char in hrp] + [0] + [ord(char) & 31 for char in hrp]


def _convert_bits(data, from_bits, to_bits, *, pad=True):
    accumulator = 0
    bits = 0
    output = []
    max_value = (1 << to_bits) - 1
    for value in data:
        accumulator = (accumulator << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            output.append((accumulator >> bits) & max_value)
    if pad and bits:
        output.append((accumulator << (to_bits - bits)) & max_value)
    return output


def make_valid_bech32_address():
    hrp = "bc"
    witness_version = 0
    witness_program = bytes(range(20))
    data = [witness_version] + _convert_bits(list(witness_program), 8, 5, pad=True)
    values = _bech32_hrp_expand(hrp) + data
    polymod = _bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
    checksum = [(polymod >> 5 * (5 - index)) & 31 for index in range(6)]
    encoded = hrp + "1" + "".join(BECH32_CHARSET[item] for item in data + checksum)
    return encoded


class FakeWalletClassifier:
    classes_ = [0, 1]

    def predict(self, feature_row):
        return [1 if float(row.get("btc_transacted_total", 0.0)) >= 100.0 else 0 for _, row in feature_row.iterrows()]

    def predict_proba(self, feature_row):
        probabilities = []
        for _, row in feature_row.iterrows():
            volume = float(row.get("btc_transacted_total", 0.0))
            risk_score = min(0.95, max(0.05, volume / 200.0))
            probabilities.append([1.0 - risk_score, risk_score])
        return probabilities


class WalletHardeningTests(unittest.TestCase):
    maxDiff = None

    def setUp(self):
        for cached_function in [
            load_model,
            load_feature_columns,
            load_feature_importance,
            get_feature_store_column_map,
            _get_cached_feature_row,
            _analyze_wallet_cached,
        ]:
            cached_function.cache_clear()

        self.client = TestClient(app)
        self.importance_df = pd.DataFrame(
            [
                {"feature": "total_txs", "importance": 0.4},
                {"feature": "btc_transacted_total", "importance": 0.3},
                {"feature": "transacted_w_address_total", "importance": 0.2},
                {"feature": "num_addr_transacted_multiple", "importance": 0.1},
            ]
        )

    def _common_patches(self):
        return [
            patch("src.predict_wallet.load_model", return_value=FakeWalletClassifier()),
            patch("src.predict_wallet.get_cached_features", return_value=None),
            patch("src.predict_wallet.load_feature_importance", return_value=self.importance_df),
            patch("src.predict_wallet.summarize_wallet", return_value="Controlled fallback summary."),
        ]

    def _patched(self):
        return ExitStack()

    def _assert_contract(self, payload):
        self.assertIn("risk_score", payload)
        self.assertIn("risk_label", payload)
        self.assertIn("features", payload)
        self.assertIn("graph", payload)
        self.assertIn("nodes", payload["graph"])
        self.assertIn("edges", payload["graph"])
        self.assertIn("paths", payload["graph"])
        self.assertEqual(set(LIVE_FEATURE_COLUMNS).issubset(payload["features"].keys()), True)
        self.assertFalse(contains_invalid_numbers(payload))

    def test_invalid_address_returns_structured_error(self):
        response = self.client.get("/api/wallet/not_a_wallet")
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self._assert_contract(payload)
        self.assertEqual(payload["risk_label"], "invalid")
        self.assertGreaterEqual(len(payload["errors"]), 1)

    def test_empty_wallet_returns_minimal_complete_contract(self):
        address = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
        summary = {"chain_stats": {"tx_count": 0, "funded_txo_count": 0, "funded_txo_sum": 0, "spent_txo_count": 0, "spent_txo_sum": 0}, "mempool_stats": {}}

        with self._patched() as stack:
            stack.enter_context(patch("src.feature_builder.get_address_summary", return_value=summary))
            stack.enter_context(patch("src.feature_builder.get_all_address_txs", return_value=[]))
            for patcher in self._common_patches():
                stack.enter_context(patcher)
            payload = self.client.get(f"/api/wallet/{address}").json()

        self._assert_contract(payload)
        self.assertEqual(payload["wallet_address"], address)
        self.assertEqual(len(payload["graph"]["nodes"]), 1)
        self.assertGreaterEqual(len(payload["graph"]["paths"]), 1)
        self.assertEqual(payload["graph"]["edges"], [])

    def test_low_activity_wallet_handles_two_transactions(self):
        address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
        counterparty_in = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"
        counterparty_out = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
        txs = [
            make_tx("tx-in-1", [(counterparty_in, 200_000_000)], [(address, 150_000_000)]),
            make_tx("tx-out-1", [(address, 120_000_000)], [(counterparty_out, 100_000_000), (address, 18_000_000)]),
        ]
        summary = {
            "chain_stats": {
                "tx_count": 2,
                "funded_txo_count": 1,
                "funded_txo_sum": 150_000_000,
                "spent_txo_count": 1,
                "spent_txo_sum": 120_000_000,
            },
            "mempool_stats": {},
        }

        with self._patched() as stack:
            stack.enter_context(patch("src.feature_builder.get_address_summary", return_value=summary))
            stack.enter_context(patch("src.feature_builder.get_all_address_txs", return_value=txs))
            for patcher in self._common_patches():
                stack.enter_context(patcher)
            payload = self.client.get(f"/api/wallet/{address}").json()

        self._assert_contract(payload)
        self.assertGreaterEqual(payload["graph"]["edge_count"], 1)
        self.assertGreaterEqual(payload["graph"]["path_count"], 1)
        for edge in payload["graph"]["edges"]:
            self.assertAlmostEqual(edge["btc_total"], edge["btc_sent"] + edge["btc_received"], places=8)

    def test_high_activity_wallet_uses_bounded_complete_output(self):
        address = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"
        counterparties = [
            "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
            "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF",
            "bc1qa5wkga2g8253a6962r2s23snge2jru2z572aaz",
            "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
        ]
        txs = []
        for index in range(60):
            incoming = counterparties[index % len(counterparties)]
            outgoing = counterparties[(index + 1) % len(counterparties)]
            txs.append(
                make_tx(
                    f"tx-{index}",
                    [(incoming, 300_000_000 + index * 10_000)],
                    [(address, 120_000_000), (outgoing, 100_000_000), (address, 70_000_000)],
                    block_height=840_000 + index,
                    block_time=1_700_000_000 + index,
                )
            )
        summary = {
            "chain_stats": {
                "tx_count": 50_000,
                "funded_txo_count": 25_000,
                "funded_txo_sum": 9_000_000_000,
                "spent_txo_count": 25_000,
                "spent_txo_sum": 8_500_000_000,
            },
            "mempool_stats": {},
        }

        with self._patched() as stack:
            stack.enter_context(patch("src.feature_builder.get_address_summary", return_value=summary))
            stack.enter_context(patch("src.feature_builder.get_all_address_txs", return_value=txs))
            for patcher in self._common_patches():
                stack.enter_context(patcher)
            payload = self.client.get(f"/api/wallet/{address}").json()

        self._assert_contract(payload)
        self.assertEqual(payload["features"]["total_txs"], 50_000.0)
        self.assertLessEqual(payload["graph"]["path_count"], 10)
        self.assertGreaterEqual(payload["risk_score"], 0.0)

    def test_watchlist_wallet_returns_controlled_fallback(self):
        address = "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF"
        summary = {"chain_stats": {"tx_count": 0, "funded_txo_count": 0, "funded_txo_sum": 0, "spent_txo_count": 0, "spent_txo_sum": 0}, "mempool_stats": {}}

        with self._patched() as stack:
            stack.enter_context(patch("src.feature_builder.get_address_summary", return_value=summary))
            stack.enter_context(patch("src.feature_builder.get_all_address_txs", return_value=[]))
            for patcher in self._common_patches():
                stack.enter_context(patcher)
            payload = self.client.get(f"/api/wallet/{address}").json()

        self._assert_contract(payload)
        self.assertEqual(payload["risk_label"], "illicit")
        self.assertGreaterEqual(payload["risk_score"], 0.95)
        self.assertEqual(payload["graph"]["nodes"][0]["id"], address)

    def test_valid_bech32_wallet_is_supported(self):
        address = make_valid_bech32_address()
        summary = {"chain_stats": {"tx_count": 0, "funded_txo_count": 0, "funded_txo_sum": 0, "spent_txo_count": 0, "spent_txo_sum": 0}, "mempool_stats": {}}

        with self._patched() as stack:
            stack.enter_context(patch("src.feature_builder.get_address_summary", return_value=summary))
            stack.enter_context(patch("src.feature_builder.get_all_address_txs", return_value=[]))
            for patcher in self._common_patches():
                stack.enter_context(patcher)
            response = self.client.get(f"/api/wallet/{address}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self._assert_contract(payload)
        self.assertEqual(payload["wallet_address"], address)


if __name__ == "__main__":
    unittest.main()
