from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.analysis_cache import (  # noqa: E402
    get_cached_wallet_analysis,
    set_cached_wallet_analysis,
)
from src.wallet_analysis_service import analyze_wallet  # noqa: E402


ADDRESS = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"


class AnalysisCacheTests(unittest.TestCase):
    def test_cache_hit_returns_complete_analysis_without_recomputing(self):
        cached = {
            "wallet_address": ADDRESS,
            "risk_score": 0.91,
            "risk_label": "illicit",
            "features": {"total_txs": 12.0},
            "graph": {"nodes": [], "edges": [], "paths": []},
        }

        with (
            patch("src.wallet_analysis_service.get_cached_wallet_analysis", return_value=cached),
            patch("src.wallet_analysis_service._analyze_wallet_cached") as analyze,
            patch("src.wallet_analysis_service.set_cached_wallet_analysis") as store,
        ):
            result = analyze_wallet(ADDRESS)

        self.assertEqual(result, cached)
        self.assertIsNot(result, cached)
        analyze.assert_not_called()
        store.assert_not_called()

    def test_cache_miss_runs_existing_workflow_and_stores_complete_result(self):
        computed = {
            "wallet_address": ADDRESS,
            "risk_score": 0.04,
            "risk_label": "licit",
            "features": {"total_txs": 3.0},
            "graph": {"nodes": [{"id": ADDRESS}], "edges": [], "paths": []},
        }

        with (
            patch("src.wallet_analysis_service.get_cached_wallet_analysis", return_value=None),
            patch("src.wallet_analysis_service._analyze_wallet_cached", return_value=computed) as analyze,
            patch("src.wallet_analysis_service.set_cached_wallet_analysis", return_value=True) as store,
        ):
            result = analyze_wallet(ADDRESS)

        self.assertEqual(result, computed)
        analyze.assert_called_once()
        store.assert_called_once_with(ADDRESS, computed)

    def test_redis_read_failure_behaves_like_cache_miss(self):
        client = Mock()
        client.get.side_effect = ConnectionError("redis unavailable")

        with patch("src.analysis_cache.get_redis_client", return_value=client):
            self.assertIsNone(get_cached_wallet_analysis(ADDRESS))

    def test_complete_analysis_is_serialized_with_ttl_and_versioned_key(self):
        client = Mock()
        analysis = {
            "wallet_address": ADDRESS,
            "risk_score": 0.42,
            "features": {"total_txs": 5.0},
            "graph": {"nodes": [], "edges": [], "paths": []},
        }

        with (
            patch("src.analysis_cache.get_redis_client", return_value=client),
            patch.dict(
                "os.environ",
                {
                    "ANALYSIS_CACHE_VERSION": "model-7",
                    "ANALYSIS_CACHE_TTL_SECONDS": "600",
                },
            ),
        ):
            stored = set_cached_wallet_analysis(ADDRESS, analysis)

        self.assertTrue(stored)
        args = client.setex.call_args.args
        self.assertEqual(args[0], f"wallet-analysis:model-7:{ADDRESS}")
        self.assertEqual(args[1], 600)
        self.assertIn('"risk_score":0.42', args[2])


if __name__ == "__main__":
    unittest.main()
