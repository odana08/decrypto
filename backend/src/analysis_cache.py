from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict, Optional

from redis import Redis


DEFAULT_CACHE_TTL_SECONDS = 900
DEFAULT_CACHE_VERSION = "v1"


def get_redis_url() -> str:
    return os.getenv("REDIS_URL", "").strip()


def cache_enabled() -> bool:
    return bool(get_redis_url())


def _cache_version() -> str:
    return (
        os.getenv("ANALYSIS_CACHE_VERSION")
        or os.getenv("MODEL_VERSION")
        or os.getenv("RAILWAY_GIT_COMMIT_SHA")
        or DEFAULT_CACHE_VERSION
    ).strip()


def _cache_ttl_seconds() -> int:
    try:
        return max(1, int(os.getenv("ANALYSIS_CACHE_TTL_SECONDS", str(DEFAULT_CACHE_TTL_SECONDS))))
    except (TypeError, ValueError):
        return DEFAULT_CACHE_TTL_SECONDS


def wallet_analysis_cache_key(address: str) -> str:
    return f"wallet-analysis:{_cache_version()}:{address}"


@lru_cache(maxsize=1)
def get_redis_client() -> Optional[Redis]:
    url = get_redis_url()
    if not url:
        return None
    return Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
        health_check_interval=30,
    )


def get_cached_wallet_analysis(address: str) -> Optional[Dict[str, Any]]:
    client = get_redis_client()
    if client is None:
        return None

    try:
        raw = client.get(wallet_analysis_cache_key(address))
        if not raw:
            return None
        payload = json.loads(raw)
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def set_cached_wallet_analysis(address: str, analysis: Dict[str, Any]) -> bool:
    client = get_redis_client()
    if client is None:
        return False

    try:
        client.setex(
            wallet_analysis_cache_key(address),
            _cache_ttl_seconds(),
            json.dumps(analysis, allow_nan=False, separators=(",", ":")),
        )
        return True
    except Exception:
        return False


def redis_health() -> Dict[str, Any]:
    client = get_redis_client()
    if client is None:
        return {"enabled": False, "connected": False}
    try:
        return {"enabled": True, "connected": bool(client.ping())}
    except Exception:
        return {"enabled": True, "connected": False}
