from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import json
from typing import Any, Dict, Optional

from src.btc_address import validate_bitcoin_address
from src.database import fetch_watchlist_entry

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
WATCHLIST_PATH = DATA_DIR / "address_watchlist.json"


@lru_cache(maxsize=1)
def load_address_watchlist() -> Dict[str, Dict[str, Any]]:
    if not WATCHLIST_PATH.exists():
        return {}

    with open(WATCHLIST_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, dict):
        return {}

    normalized: Dict[str, Dict[str, Any]] = {}
    for address, metadata in raw.items():
        try:
            normalized_address = validate_bitcoin_address(address).normalized
        except Exception:
            continue
        normalized[normalized_address] = metadata if isinstance(metadata, dict) else {}
    return normalized


def lookup_address_reputation(address: str) -> Optional[Dict[str, Any]]:
    if not address:
        return None
    try:
        normalized_address = validate_bitcoin_address(address).normalized
    except Exception:
        return None
    db_match = fetch_watchlist_entry(normalized_address)
    if db_match:
        return db_match
    return load_address_watchlist().get(normalized_address)
