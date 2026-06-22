from __future__ import annotations

from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.database import database_enabled, init_schema, table_counts  # noqa: E402


def main() -> None:
    if not database_enabled():
        raise SystemExit("DATABASE_URL is not configured.")

    init_schema()
    print("Database schema is ready.")
    print(table_counts())


if __name__ == "__main__":
    main()
