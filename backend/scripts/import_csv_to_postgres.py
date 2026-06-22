from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Dict, Iterable, List

import pandas as pd
from psycopg.types.json import Jsonb


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.btc_address import validate_bitcoin_address  # noqa: E402
from src.database import connect, database_enabled, init_schema, table_counts  # noqa: E402


DATA_DIR = BACKEND_DIR / "data"
FEATURES_PATH = DATA_DIR / "wallets_features.csv"
CLASSES_PATH = DATA_DIR / "wallets_classes.csv"
WATCHLIST_PATH = DATA_DIR / "address_watchlist.json"
EDGE_PATH = DATA_DIR / "AddrAddr_edgelist.csv"


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip().str.replace(" ", "_")
    return df


def _clean_feature_record(record: Dict[str, Any]) -> Dict[str, float]:
    output: Dict[str, float] = {}
    for key, value in record.items():
        if key == "address":
            continue
        numeric = pd.to_numeric(value, errors="coerce")
        output[str(key)] = 0.0 if pd.isna(numeric) else float(numeric)
    return output


def _batched(values: List[tuple], size: int) -> Iterable[List[tuple]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def import_features(chunk_size: int) -> None:
    if not FEATURES_PATH.exists():
        print(f"Skipping missing {FEATURES_PATH}")
        return

    total = 0
    with connect() as connection:
        for chunk in pd.read_csv(FEATURES_PATH, chunksize=chunk_size):
            chunk = _clean_columns(chunk)
            rows = []
            for record in chunk.to_dict(orient="records"):
                address = str(record.get("address", "")).strip()
                if not address:
                    continue
                rows.append((address, Jsonb(_clean_feature_record(record)), "elliptic"))

            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO wallet_features (address, features, source)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (address) DO UPDATE SET
                        features = EXCLUDED.features,
                        source = EXCLUDED.source,
                        updated_at = now()
                    """,
                    rows,
                )
            connection.commit()
            total += len(rows)
            print(f"Imported {total:,} wallet feature rows")


def import_labels(chunk_size: int) -> None:
    if not CLASSES_PATH.exists():
        print(f"Skipping missing {CLASSES_PATH}")
        return

    total = 0
    with connect() as connection:
        for chunk in pd.read_csv(CLASSES_PATH, chunksize=chunk_size):
            chunk = _clean_columns(chunk)
            rows = []
            for record in chunk.to_dict(orient="records"):
                address = str(record.get("address", "")).strip()
                if not address:
                    continue
                rows.append((address, int(record.get("class", 3)), "elliptic"))

            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO wallet_labels (address, class, source)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (address) DO UPDATE SET
                        class = EXCLUDED.class,
                        source = EXCLUDED.source,
                        updated_at = now()
                    """,
                    rows,
                )
            connection.commit()
            total += len(rows)
            print(f"Imported {total:,} wallet label rows")


def import_watchlist() -> None:
    if not WATCHLIST_PATH.exists():
        print(f"Skipping missing {WATCHLIST_PATH}")
        return

    raw = json.loads(WATCHLIST_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print("Skipping watchlist because it is not an object")
        return

    rows = []
    for address, metadata in raw.items():
        try:
            normalized = validate_bitcoin_address(address).normalized
        except Exception:
            continue
        rows.append((normalized, Jsonb(metadata if isinstance(metadata, dict) else {})))

    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO address_watchlist (address, metadata)
                VALUES (%s, %s)
                ON CONFLICT (address) DO UPDATE SET
                    metadata = EXCLUDED.metadata,
                    updated_at = now()
                """,
                rows,
            )
        connection.commit()
    print(f"Imported {len(rows):,} watchlist rows")


def import_edges(chunk_size: int, batch_size: int) -> None:
    if not EDGE_PATH.exists():
        print(f"Skipping missing {EDGE_PATH}")
        return

    total = 0
    with connect() as connection:
        for chunk in pd.read_csv(EDGE_PATH, chunksize=chunk_size):
            chunk = _clean_columns(chunk)
            rows = []
            for record in chunk.to_dict(orient="records"):
                source = str(record.get("input_address", "")).strip()
                target = str(record.get("output_address", "")).strip()
                if source and target:
                    rows.append((source, target, "elliptic"))

            with connection.cursor() as cursor:
                for batch in _batched(rows, batch_size):
                    cursor.executemany(
                        """
                        INSERT INTO addraddr_edges (input_address, output_address, source)
                        VALUES (%s, %s, %s)
                        """,
                        batch,
                    )
            connection.commit()
            total += len(rows)
            print(f"Imported {total:,} address edge rows")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import local CSV datasets into Postgres.")
    parser.add_argument("--chunk-size", type=int, default=25_000)
    parser.add_argument("--batch-size", type=int, default=5_000)
    parser.add_argument("--skip-edges", action="store_true", help="Skip importing AddrAddr_edgelist.csv.")
    return parser.parse_args()


def main() -> None:
    if not database_enabled():
        raise SystemExit("DATABASE_URL is not configured.")

    args = parse_args()
    init_schema()
    import_features(args.chunk_size)
    import_labels(args.chunk_size)
    import_watchlist()
    if not args.skip_edges:
        import_edges(args.chunk_size, args.batch_size)
    table_counts.cache_clear()
    print("Import complete.")
    print(table_counts())


if __name__ == "__main__":
    main()
