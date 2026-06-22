from __future__ import annotations

import os
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Dict, Iterable, Iterator, List, Optional

import pandas as pd
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

try:
    from src.analysis_contracts import safe_float, safe_int, safe_text
except ModuleNotFoundError:
    from analysis_contracts import safe_float, safe_int, safe_text


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS wallet_features (
    address TEXT PRIMARY KEY,
    features JSONB NOT NULL,
    source TEXT NOT NULL DEFAULT 'elliptic',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_labels (
    address TEXT PRIMARY KEY,
    class INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'elliptic',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_wallet_feature_observations (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    feature_source TEXT NOT NULL DEFAULT 'mempool',
    features JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS address_watchlist (
    address TEXT PRIMARY KEY,
    metadata JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS addraddr_edges (
    input_address TEXT NOT NULL,
    output_address TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'elliptic',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_labels_class ON wallet_labels (class);
CREATE INDEX IF NOT EXISTS idx_addraddr_edges_input ON addraddr_edges (input_address);
CREATE INDEX IF NOT EXISTS idx_addraddr_edges_output ON addraddr_edges (output_address);
"""


def get_database_url() -> str:
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("POSTGRESQL_URL")
        or ""
    ).strip()


def database_enabled() -> bool:
    return bool(get_database_url())


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    url = get_database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured.")
    with psycopg.connect(url, row_factory=dict_row) as connection:
        yield connection


def init_schema() -> None:
    if not database_enabled():
        return
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(SCHEMA_SQL)
        connection.commit()
    table_counts.cache_clear()


@lru_cache(maxsize=1)
def table_counts() -> Dict[str, int]:
    if not database_enabled():
        return {}
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                counts: Dict[str, int] = {}
                for table in [
                    "wallet_features",
                    "wallet_labels",
                    "live_wallet_feature_observations",
                    "address_watchlist",
                    "addraddr_edges",
                ]:
                    cursor.execute(f"SELECT COUNT(*) AS count FROM {table}")
                    counts[table] = safe_int(cursor.fetchone()["count"], minimum=0)
                return counts
    except Exception:
        return {}


def fetch_wallet_features(address: str, feature_columns: Iterable[str]) -> Optional[Dict[str, float]]:
    if not database_enabled():
        return None

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT features FROM wallet_features WHERE address = %s",
                    (address,),
                )
                row = cursor.fetchone()
                if not row:
                    return None

                raw_features = row["features"] or {}
                return {
                    safe_text(column): safe_float(raw_features.get(safe_text(column), 0.0), 0.0, minimum=0.0)
                    for column in feature_columns
                    if safe_text(column)
                }
    except Exception:
        return None


def save_live_feature_observation(address: str, features: Dict[str, float], *, source: str = "mempool") -> None:
    if not database_enabled():
        return

    try:
        init_schema()
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO live_wallet_feature_observations (address, feature_source, features)
                    VALUES (%s, %s, %s)
                    """,
                    (address, source, Jsonb(features)),
                )
            connection.commit()
        table_counts.cache_clear()
    except Exception:
        return


def fetch_watchlist_entry(address: str) -> Optional[Dict[str, Any]]:
    if not database_enabled():
        return None

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT metadata FROM address_watchlist WHERE address = %s",
                    (address,),
                )
                row = cursor.fetchone()
                if not row:
                    return None
                metadata = row["metadata"]
                return metadata if isinstance(metadata, dict) else {}
    except Exception:
        return None


def load_training_frame_from_db() -> pd.DataFrame:
    if not database_enabled():
        return pd.DataFrame()

    try:
        with connect() as connection:
            rows = connection.execute(
                """
                SELECT wf.address, wf.features, wl.class
                FROM wallet_features wf
                JOIN wallet_labels wl ON wl.address = wf.address
                WHERE wl.class IN (1, 2)
                """
            ).fetchall()
    except Exception:
        return pd.DataFrame()

    records: List[Dict[str, Any]] = []
    for row in rows:
        record = {"address": row["address"], "class": row["class"]}
        features = row["features"] or {}
        if isinstance(features, dict):
            record.update(features)
        records.append(record)
    return pd.DataFrame(records)


def load_labelled_live_frame_from_db() -> pd.DataFrame:
    if not database_enabled():
        return pd.DataFrame()

    try:
        with connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT ON (obs.address)
                    obs.address,
                    obs.features,
                    labels.class
                FROM live_wallet_feature_observations obs
                JOIN wallet_labels labels ON labels.address = obs.address
                WHERE labels.class IN (1, 2)
                ORDER BY obs.address, obs.observed_at DESC
                """
            ).fetchall()
    except Exception:
        return pd.DataFrame()

    records: List[Dict[str, Any]] = []
    for row in rows:
        record = {"address": row["address"], "class": row["class"]}
        features = row["features"] or {}
        if isinstance(features, dict):
            record.update(features)
        records.append(record)
    return pd.DataFrame(records)


def load_network_dataset_from_db(feature_columns: Iterable[str], raw_columns: Iterable[str]) -> pd.DataFrame:
    if not database_enabled():
        return pd.DataFrame()

    requested_columns = [safe_text(column) for column in set(feature_columns) | set(raw_columns) if safe_text(column)]
    try:
        with connect() as connection:
            rows = connection.execute(
                """
                SELECT wf.address, wf.features, wl.class
                FROM wallet_features wf
                LEFT JOIN wallet_labels wl ON wl.address = wf.address
                """
            ).fetchall()
    except Exception:
        return pd.DataFrame()

    records: List[Dict[str, Any]] = []
    for row in rows:
        features = row["features"] if isinstance(row["features"], dict) else {}
        record: Dict[str, Any] = {"address": row["address"], "class": row.get("class")}
        for column in requested_columns:
            record[column] = safe_float(features.get(column, 0.0), 0.0, minimum=0.0)
        records.append(record)
    return pd.DataFrame(records)


def stream_addraddr_edge_chunks(seed_addresses: Iterable[str], *, chunk_size: int = 50_000) -> Iterator[pd.DataFrame]:
    seed_list = [safe_text(address) for address in seed_addresses if safe_text(address)]
    if not database_enabled() or not seed_list:
        return

    offset = 0
    while True:
        try:
            with connect() as connection:
                rows = connection.execute(
                    """
                    SELECT input_address, output_address
                    FROM addraddr_edges
                    WHERE input_address = ANY(%s) OR output_address = ANY(%s)
                    ORDER BY input_address, output_address
                    LIMIT %s OFFSET %s
                    """,
                    (seed_list, seed_list, chunk_size, offset),
                ).fetchall()
        except Exception:
            return

        if not rows:
            return
        yield pd.DataFrame(rows)
        offset += chunk_size
