from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import json
from typing import Dict, List, Optional, Tuple

import joblib
import pandas as pd

from src.address_reputation import lookup_address_reputation
from src.analysis_contracts import (
    build_analysis_contract,
    build_empty_graph,
    clamp,
    empty_feature_map,
    safe_float,
    safe_int,
    safe_text,
)
from src.btc_address import validate_bitcoin_address
from src.feature_builder import LIVE_FEATURE_COLUMNS, build_live_features, get_merged_address_stats
from src.llm_summarizer import summarize_wallet

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

FEATURES_PATH = DATA_DIR / "wallets_features.csv"
MODEL_PATH = MODELS_DIR / "btc_live_random_forest.joblib"
FEATURE_LIST_PATH = MODELS_DIR / "btc_live_feature_columns.json"
IMPORTANCE_PATH = MODELS_DIR / "btc_live_feature_importance.csv"

FEATURE_MEANINGS = {
    "total_txs": "the total number of transactions associated with the wallet",
    "transacted_w_address_total": "the breadth of counterparties the wallet has interacted with",
    "blocks_btwn_txs_mean": "the average spacing between the wallet's transactions in blockchain time",
    "blocks_btwn_input_txs_mean": "the average spacing between outgoing transactions",
    "blocks_btwn_output_txs_mean": "the average spacing between incoming transactions",
    "btc_sent_total": "the total amount of Bitcoin sent by the wallet",
    "btc_received_total": "the total amount of Bitcoin received by the wallet",
    "btc_transacted_total": "the total amount of Bitcoin that has moved through the wallet",
    "num_txs_as_sender": "how often the wallet acts as a sender",
    "num_txs_as_receiver": "how often the wallet acts as a receiver",
    "num_addr_transacted_multiple": "how often the wallet repeatedly interacts with the same counterparties",
    "fees_total": "the total transaction fees paid by the wallet",
    "fees_as_share_total": "how large the wallet's transaction fees are relative to the value it transfers",
    "fees_as_share_max": "the highest fee burden observed in the wallet's transactions",
    "fees_mean": "the wallet's average transaction fee",
    "btc_sent_mean": "the typical size of outgoing transfers",
    "btc_received_mean": "the typical size of incoming transfers",
    "btc_transacted_mean": "the typical total value moved in transactions involving the wallet",
    "transacted_w_address_mean": "the typical number of counterparties involved per transaction",
    "blocks_btwn_txs_total": "the total span of blockchain time between the wallet's transactions",
}


def clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip().str.replace(" ", "_")
    return df


def normalize_column_name(name: str) -> str:
    return safe_text(name).replace(" ", "_")


@lru_cache(maxsize=1)
def load_model():
    try:
        if not MODEL_PATH.exists():
            return None
        return joblib.load(MODEL_PATH)
    except Exception:
        return None


@lru_cache(maxsize=1)
def load_feature_columns() -> List[str]:
    try:
        with open(FEATURE_LIST_PATH, "r", encoding="utf-8") as file:
            raw_columns = json.load(file)
        columns = [normalize_column_name(column) for column in raw_columns if safe_text(column)]
        return columns or list(LIVE_FEATURE_COLUMNS)
    except Exception:
        return list(LIVE_FEATURE_COLUMNS)


@lru_cache(maxsize=1)
def load_feature_importance() -> pd.DataFrame:
    try:
        df = pd.read_csv(IMPORTANCE_PATH)
        df["feature"] = df["feature"].astype(str).map(normalize_column_name)
        df["importance"] = df["importance"].map(lambda value: safe_float(value, 0.0, minimum=0.0))
        return df.sort_values("importance", ascending=False).reset_index(drop=True)
    except Exception:
        return pd.DataFrame(
            [{"feature": column, "importance": 0.0} for column in load_feature_columns()]
        )


@lru_cache(maxsize=1)
def get_feature_store_column_map() -> Dict[str, str]:
    try:
        header = pd.read_csv(FEATURES_PATH, nrows=0)
        return {normalize_column_name(raw_name): raw_name for raw_name in header.columns}
    except Exception:
        return {}


@lru_cache(maxsize=256)
def _get_cached_feature_row(address: str, feature_columns: Tuple[str, ...]) -> Optional[Tuple[float, ...]]:
    if not FEATURES_PATH.exists():
        return None

    column_map = get_feature_store_column_map()
    raw_usecols = ["address"]
    for column in feature_columns:
        raw_name = column_map.get(column)
        if raw_name and raw_name not in raw_usecols:
            raw_usecols.append(raw_name)

    if len(raw_usecols) == 1:
        return None

    try:
        for chunk in pd.read_csv(FEATURES_PATH, usecols=raw_usecols, chunksize=50_000):
            chunk = clean_columns(chunk)
            row = chunk.loc[chunk["address"] == address]
            if row.empty:
                continue
            record = row.iloc[0]
            return tuple(safe_float(record.get(column, 0.0), 0.0, minimum=0.0) for column in feature_columns)
    except Exception:
        return None
    return None


def get_cached_features(address: str, feature_columns: List[str]) -> Optional[pd.DataFrame]:
    normalized_address = validate_bitcoin_address(address).normalized
    feature_tuple = tuple(feature_columns)
    row_values = _get_cached_feature_row(normalized_address, feature_tuple)
    if row_values is None:
        return None

    df = pd.DataFrame([dict(zip(feature_tuple, row_values))])
    df.attrs["normalized_address"] = normalized_address
    df.attrs["sampled_tx_count"] = 0
    df.attrs["sampled_btc_total"] = 0.0
    df.attrs["lifetime_tx_count"] = safe_int(df.iloc[0].get("total_txs", 0.0), minimum=0)
    df.attrs["lifetime_btc_total"] = safe_float(df.iloc[0].get("btc_transacted_total", 0.0), minimum=0.0)
    df.attrs["warnings"] = []
    return df


def _sanitize_feature_frame(feature_row: pd.DataFrame, feature_columns: List[str]) -> pd.DataFrame:
    feature_row = feature_row.copy()
    for column in feature_columns:
        if column not in feature_row.columns:
            feature_row[column] = 0.0
        feature_row[column] = feature_row[column].map(lambda value: safe_float(value, 0.0, minimum=0.0))
    feature_row = feature_row[feature_columns]
    return feature_row


def get_live_features(address: str, feature_columns: List[str]) -> pd.DataFrame:
    live_df = build_live_features(address)
    attrs = dict(live_df.attrs)
    live_df = _sanitize_feature_frame(live_df, feature_columns)
    live_df.attrs.update(attrs)
    return live_df


def _fallback_feature_importance(feature_row: pd.DataFrame, top_n: int) -> List[Dict[str, float | str]]:
    row_dict = feature_row.iloc[0].to_dict()
    ranked = sorted(
        row_dict.items(),
        key=lambda item: abs(safe_float(item[1], 0.0)),
        reverse=True,
    )
    output = []
    for feature_name, value in ranked[:top_n]:
        output.append(
            {
                "feature": feature_name,
                "value": safe_float(value, 0.0, minimum=0.0),
                "importance": 0.0,
                "meaning": FEATURE_MEANINGS.get(feature_name, feature_name),
            }
        )
    return output


def get_top_features(feature_row: pd.DataFrame, top_n: int = 5) -> List[Dict[str, float | str]]:
    feature_importance = load_feature_importance()
    row_dict = feature_row.iloc[0].to_dict()

    candidates: List[Dict[str, float | str]] = []
    for _, item in feature_importance.iterrows():
        feature_name = normalize_column_name(item.get("feature"))
        if feature_name not in row_dict:
            continue
        value = safe_float(row_dict.get(feature_name, 0.0), 0.0, minimum=0.0)
        importance = safe_float(item.get("importance", 0.0), 0.0, minimum=0.0)
        if value == 0.0 and importance == 0.0:
            continue
        candidates.append(
            {
                "feature": feature_name,
                "value": value,
                "importance": importance,
                "meaning": FEATURE_MEANINGS.get(feature_name, feature_name),
            }
        )

    if not candidates:
        return _fallback_feature_importance(feature_row, top_n)
    return candidates[:top_n]


def _feature_row_to_features(feature_row: pd.DataFrame) -> Dict[str, float]:
    row = feature_row.iloc[0].to_dict()
    return {column: safe_float(row.get(column, 0.0), 0.0, minimum=0.0) for column in feature_row.columns}


def _build_history_context(address: str, feature_row: pd.DataFrame) -> Dict[str, float]:
    sampled_tx_count = safe_float(feature_row.attrs.get("sampled_tx_count", 0), minimum=0.0)
    sampled_btc_total = safe_float(feature_row.attrs.get("sampled_btc_total", 0.0), minimum=0.0)
    lifetime_tx_count = safe_float(feature_row.attrs.get("lifetime_tx_count", 0), minimum=0.0)
    lifetime_btc_total = safe_float(feature_row.attrs.get("lifetime_btc_total", 0.0), minimum=0.0)

    if lifetime_tx_count == 0 and address:
        try:
            address_stats = get_merged_address_stats(address)
            lifetime_tx_count = safe_float(address_stats.get("tx_count", 0), minimum=0.0)
            lifetime_btc_total = safe_float(
                (address_stats.get("funded_txo_sum", 0) + address_stats.get("spent_txo_sum", 0)) / 1e8,
                minimum=0.0,
            )
        except Exception:
            lifetime_tx_count = sampled_tx_count
            lifetime_btc_total = sampled_btc_total

    sample_coverage = 1.0 if lifetime_tx_count == 0 else min(1.0, sampled_tx_count / lifetime_tx_count)
    return {
        "sampled_tx_count": sampled_tx_count,
        "sampled_btc_total": sampled_btc_total,
        "lifetime_tx_count": lifetime_tx_count,
        "lifetime_btc_total": lifetime_btc_total,
        "sample_coverage": sample_coverage,
    }


def _build_analysis_notes(
    history_context: Dict[str, float],
    watchlist_match: Optional[Dict[str, object]],
    warnings: Optional[List[str]] = None,
) -> List[str]:
    notes: List[str] = []
    sampled_tx_count = int(safe_float(history_context.get("sampled_tx_count", 0.0), minimum=0.0))
    lifetime_tx_count = int(safe_float(history_context.get("lifetime_tx_count", 0.0), minimum=0.0))
    sample_coverage = safe_float(history_context.get("sample_coverage", 1.0), minimum=0.0, maximum=1.0)

    if lifetime_tx_count > sampled_tx_count and sample_coverage < 0.9:
        notes.append(
            f"Live analysis sampled {sampled_tx_count} of {lifetime_tx_count} lifetime transactions; results reflect recent observed activity."
        )
    if watchlist_match:
        notes.append(safe_text(watchlist_match.get("reason"), "Matched local analyst watchlist."))
    for warning in warnings or []:
        if safe_text(warning):
            notes.append(safe_text(warning))
    return notes


def _empty_feature_frame(feature_columns: List[str]) -> pd.DataFrame:
    df = pd.DataFrame([empty_feature_map(feature_columns)])
    df.attrs["sampled_tx_count"] = 0
    df.attrs["sampled_btc_total"] = 0.0
    df.attrs["lifetime_tx_count"] = 0
    df.attrs["lifetime_btc_total"] = 0.0
    df.attrs["warnings"] = []
    return df


def _predict_with_model(model, feature_row: pd.DataFrame) -> Tuple[int, float, str]:
    if model is None:
        raise RuntimeError("Prediction model is unavailable.")

    prediction = int(model.predict(feature_row)[0])
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(feature_row)[0]
        classes = list(getattr(model, "classes_", []))
        illicit_index = classes.index(1) if 1 in classes else min(1, len(probabilities) - 1)
        probability = probabilities[illicit_index]
        risk_score = clamp(probability, 0.0, 1.0)
    else:
        risk_score = clamp(prediction, 0.0, 1.0)
    risk_label = "illicit" if prediction == 1 else "licit"
    return prediction, risk_score, risk_label


def predict_wallet(address: str) -> dict:
    normalized_address = validate_bitcoin_address(address).normalized
    feature_columns = load_feature_columns()
    watchlist_match = lookup_address_reputation(normalized_address)
    warnings: List[str] = []

    cached_features = get_cached_features(normalized_address, feature_columns)
    if cached_features is not None:
        feature_row = cached_features
        feature_source = "local_dataset"
    else:
        try:
            feature_row = get_live_features(normalized_address, feature_columns)
            feature_source = "live_api"
        except Exception as exc:
            feature_row = _empty_feature_frame(feature_columns)
            feature_row.attrs["warnings"] = [f"Live feature fallback used: {exc}"]
            feature_source = "fallback"

    warnings.extend(list(feature_row.attrs.get("warnings", [])))
    feature_row = _sanitize_feature_frame(feature_row, feature_columns)
    features = _feature_row_to_features(feature_row)

    model = load_model()
    try:
        prediction, risk_score, risk_label = _predict_with_model(model, feature_row)
    except Exception as exc:
        raise RuntimeError(f"Wallet classifier is unavailable: {exc}") from exc

    if watchlist_match:
        risk_score = max(risk_score, safe_float(watchlist_match.get("risk_score", 0.95), minimum=0.0, maximum=1.0))
        risk_label = safe_text(watchlist_match.get("risk_label"), risk_label)
        prediction = 1 if risk_label == "illicit" else prediction
        feature_source = f"{feature_source}+watchlist"

    feature_importance = get_top_features(feature_row)
    if watchlist_match:
        feature_importance = [
            {
                "feature": "watchlist_match",
                "value": safe_text(watchlist_match.get("label"), "Known flagged wallet"),
                "importance": 1.0,
                "meaning": safe_text(watchlist_match.get("reason"), "Matched local analyst watchlist."),
            },
            *feature_importance,
        ]

    history_context = _build_history_context(normalized_address, feature_row)
    analysis_notes = _build_analysis_notes(history_context, watchlist_match, warnings)

    result = build_analysis_contract(
        normalized_address,
        risk_score=risk_score,
        risk_label=risk_label,
        prediction=prediction,
        feature_source=feature_source,
        features=features,
        feature_importance=feature_importance,
        graph=build_empty_graph(
            normalized_address,
            entity_type=safe_text((watchlist_match or {}).get("entity_type"), "wallet"),
        ),
        history_context=history_context,
        analysis_notes=analysis_notes,
        watchlist_match=watchlist_match,
        warnings=warnings,
    )
    result["ai_summary"] = summarize_wallet(result)
    return result


if __name__ == "__main__":
    wallet_address = input("Enter BTC address: ").strip()
    try:
        print(predict_wallet(wallet_address))
    except Exception as exc:
        print(f"Error: {exc}")
