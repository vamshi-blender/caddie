import argparse
import datetime as dt
import decimal
import json
import re
import sys
import time
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


def elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 3)


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        config = json.load(fh)

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

    sql = normalize_sql(sql)
    if not sql:
        raise RuntimeError("SQL is empty.")
    return sql


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


def json_value(value):
    if value is None:
        return None
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, oracledb.LOB):
        return json_value(value.read())
    return value


def column_metadata(cursor) -> list[dict]:
    columns = []
    for desc in cursor.description or []:
        columns.append(
            {
                "name": desc[0],
                "oracle_type": getattr(desc[1], "name", str(desc[1])),
                "display_size": desc[2],
                "internal_size": desc[3],
                "precision": desc[4],
                "scale": desc[5],
                "nullable": desc[6],
            }
        )
    return columns


def failure_payload(
    error_type: str,
    message: str,
    sql_text: str | None,
    total_start: float,
    timings: dict | None = None,
) -> dict:
    return {
        "ok": False,
        "error": {
            "error_type": error_type,
            "message": message,
            "sql_text": sql_text,
        },
        "timings": timings
        or {
            "connect_ms": None,
            "execute_ms": None,
            "fetch_ms": None,
            "total_ms": elapsed_ms(total_start),
        },
    }


def oracle_error_payload(exc: oracledb.Error) -> dict:
    error = exc.args[0] if exc.args else exc
    return {
        "error_type": "oracle_error",
        "oracle_code": getattr(error, "code", None),
        "oracle_message": getattr(error, "message", str(exc)),
        "oracle_context": getattr(error, "context", None),
    }


def execute_query(sql: str, config_path: Path, total_start: float) -> dict:
    if not is_read_only_query(sql):
        keyword = first_keyword(sql) or "unknown"
        return failure_payload(
            "read_only_violation",
            f"Blocked statement type '{keyword}'. Only read-only queries such as SELECT or WITH are allowed.",
            sql,
            total_start,
        )

    conn = None
    cur = None
    timings = {
        "connect_ms": None,
        "execute_ms": None,
        "fetch_ms": None,
        "total_ms": None,
    }

    try:
        config = load_config(config_path)

        step_start = time.perf_counter()
        conn = oracledb.connect(
            user=config["user"],
            password=config["password"],
            dsn=config["dsn"],
        )
        timings["connect_ms"] = elapsed_ms(step_start)

        cur = conn.cursor()

        step_start = time.perf_counter()
        cur.execute(sql)
        timings["execute_ms"] = elapsed_ms(step_start)

        columns = column_metadata(cur)
        column_names = [column["name"] for column in columns]

        step_start = time.perf_counter()
        rows = [
            {column_names[index]: json_value(value) for index, value in enumerate(row)}
            for row in cur
        ]
        timings["fetch_ms"] = elapsed_ms(step_start)
        timings["total_ms"] = elapsed_ms(total_start)

        return {
            "ok": True,
            "sql_text": sql,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "has_rows": len(rows) > 0,
            "timings": timings,
        }
    except FileNotFoundError:
        return failure_payload(
            "config_error",
            f"Config not found: {config_path}. Copy scripts/oracle.config.example.json to scripts/oracle.config.local.json and fill it in.",
            sql,
            total_start,
        )
    except json.JSONDecodeError as exc:
        return failure_payload(
            "config_error",
            f"Invalid JSON in config: {config_path}: {exc}",
            sql,
            total_start,
        )
    except RuntimeError as exc:
        return failure_payload("config_error", str(exc), sql, total_start)
    except oracledb.Error as exc:
        if conn is not None:
            conn.rollback()
        timings["total_ms"] = elapsed_ms(total_start)
        return {
            "ok": False,
            "error": {
                **oracle_error_payload(exc),
                "sql_text": sql,
            },
            "timings": timings,
        }
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Oracle SQL for the Caddie MCP server.")
    parser.add_argument("-q", "--query", help="SQL query to execute")
    parser.add_argument(
        "-c",
        "--config",
        default=str(DEFAULT_CONFIG),
        help="Path to JSON config file",
    )
    args = parser.parse_args()
    total_start = time.perf_counter()

    try:
        sql = read_sql(args.query)
        payload = execute_query(sql, Path(args.config), total_start)
    except RuntimeError as exc:
        payload = failure_payload("input_error", str(exc), None, total_start)

    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
