from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
import time
from typing import Dict

from src.analysis_cache import get_cached_wallet_analysis, set_cached_wallet_analysis
from src.analysis_contracts import build_analysis_contract
from src.btc_address import validate_bitcoin_address
from src.graph_builder import build_wallet_graph
from src.predict_wallet import predict_wallet

ANALYSIS_CACHE_TTL_SECONDS = 180


def _cache_bucket(ttl_seconds: int) -> int:
    return int(time.time() // ttl_seconds)


@lru_cache(maxsize=256)
def _analyze_wallet_cached(address: str, bucket: int) -> Dict[str, object]:
    del bucket
    prediction = predict_wallet(address)
    graph = build_wallet_graph(address, wallet_context=prediction)
    return build_analysis_contract(
        address,
        risk_score=prediction.get("risk_score", 0.0),
        risk_label=prediction.get("risk_label", "unknown"),
        prediction=prediction.get("prediction", 0),
        feature_source=prediction.get("feature_source", "fallback"),
        features=prediction.get("features", {}),
        feature_importance=prediction.get("feature_importance", []),
        graph=graph,
        history_context=prediction.get("history_context", {}),
        analysis_notes=prediction.get("analysis_notes", []),
        watchlist_match=prediction.get("watchlist_match"),
        ai_summary=prediction.get("ai_summary", ""),
        warnings=prediction.get("warnings", []),
        errors=prediction.get("errors", []),
    )


def analyze_wallet(address: str) -> Dict[str, object]:
    normalized_address = validate_bitcoin_address(address).normalized

    redis_result = get_cached_wallet_analysis(normalized_address)
    if redis_result is not None:
        return deepcopy(redis_result)

    result = _analyze_wallet_cached(normalized_address, _cache_bucket(ANALYSIS_CACHE_TTL_SECONDS))
    set_cached_wallet_analysis(normalized_address, result)
    return deepcopy(result)
