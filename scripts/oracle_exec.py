import argparse
import json
import re
import sys
from pathlib import Path

import oracledb


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = SCRIPT_DIR / "oracle.config.local.json"
FETCH_PREFIXES = {
    "select",
    "with",
    "show",
    "describe",
    "desc",
    "explain",
}
READ_ONLY_PREFIXES = FETCH_PREFIXES


LEADING_COMMENT_PATTERN = re.compile(
    r"""
    \A\s*
    (
        (--[^\n]*\n\s*)|
        (/\*.*?\*/\s*)
    )*
    """,
    re.DOTALL | re.VERBOSE,
)


def load_config(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as fh:
            config = json.load(fh)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Config not found: {path}. Copy scripts/oracle.config.example.json to scripts/oracle.config.local.json and fill it in."
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in config: {path}: {exc}") from exc

    missing = [key for key in ("user", "password", "dsn") if not config.get(key)]
    if missing:
        raise RuntimeError(f"Missing config values: {', '.join(missing)}")
    return config


def read_sql(query_arg: str | None) -> str:
    if query_arg:
        sql = query_arg
    elif not sys.stdin.isatty():
        sql = sys.stdin.read()
    else:
        raise RuntimeError("No SQL provided. Pass -q/--query or pipe SQL on stdin.")

    sql = sql.strip()
    if not sql:
        raise RuntimeError("SQL is empty.")
    return normalize_sql(sql)


def normalize_sql(sql: str) -> str:
    sql = sql.strip()
    if sql.endswith(";"):
        sql = sql[:-1].rstrip()
    return sql


def first_keyword(sql: str) -> str:
    match = LEADING_COMMENT_PATTERN.match(sql)
    start = match.end() if match else 0
    remaining = sql[start:].lstrip()
    if not remaining:
        return ""

    keyword_match = re.match(r"[A-Za-z]+", remaining)
    return keyword_match.group(0).lower() if keyword_match else ""


def is_read_only_query(sql: str) -> bool:
    return first_keyword(sql) in READ_ONLY_PREFIXES


def is_fetch_query(sql: str) -> bool:
    return is_read_only_query(sql)


def format_value(value) -> str:
    if value is None:
        return "NULL"
    return str(value)


def print_rows(cursor) -> None:
    columns = [desc[0] for desc in cursor.description or []]
    print("\t".join(columns))
    for row in cursor:
        print("\t".join(format_value(value) for value in row))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Oracle SQL from a tiny wrapper.")
    parser.add_argument("-q", "--query", help="SQL query to execute")
    parser.add_argument(
        "-c",
        "--config",
        default=str(DEFAULT_CONFIG),
        help="Path to JSON config file",
    )
    args = parser.parse_args()

    try:
        config = load_config(Path(args.config))
        sql = read_sql(args.query)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    conn = None
    cur = None
    try:
        if not is_read_only_query(sql):
            keyword = first_keyword(sql) or "unknown"
            print(
                f"READ_ONLY_ONLY: blocked statement type '{keyword}'. Only read-only queries such as SELECT or WITH are allowed."
            )
            return 0

        conn = oracledb.connect(
            user=config["user"],
            password=config["password"],
            dsn=config["dsn"],
        )
        cur = conn.cursor()
        cur.execute(sql)

        print_rows(cur)
        return 0
    except oracledb.Error as exc:
        if conn is not None:
            conn.rollback()
        print(f"ORACLE_ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
