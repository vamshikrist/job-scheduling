"""SAP HANA Cloud access."""
import base64
import datetime
import decimal
import re

from hdbcli import dbapi

from config import DATA_ORDER_BY, HANA_SCHEMA, HANA_TABLE, get_hana_credentials

TABLE_REF = f'"{HANA_SCHEMA}"."{HANA_TABLE}"'
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def connect():
    creds = get_hana_credentials()
    return dbapi.connect(
        address=creds["host"],
        port=int(creds["port"]),
        user=creds["user"],
        password=creds["password"],
        encrypt=True,
        sslValidateCertificate=True,
    )


def _order_by_clause():
    if not DATA_ORDER_BY:
        return ""
    columns = [c.strip() for c in DATA_ORDER_BY.split(",") if c.strip()]
    if not all(_IDENTIFIER.match(c) for c in columns):
        raise ValueError(f"Invalid DATA_ORDER_BY: {DATA_ORDER_BY!r}")
    return " ORDER BY " + ", ".join(f'"{c.upper()}"' for c in columns)


def to_json_value(value):
    """Convert HANA column values to something jsonify can serialise."""
    if isinstance(value, decimal.Decimal):
        return str(value)  # keep full precision for amounts
    if isinstance(value, (datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(value)).decode()
    return value


def fetch_page(page, page_size):
    """Return one page of the table plus the total row count."""
    conn = connect()
    cursor = conn.cursor()
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TABLE_REF}")
        total = cursor.fetchone()[0]

        offset = (page - 1) * page_size
        cursor.execute(
            f"SELECT * FROM {TABLE_REF}{_order_by_clause()} "
            f"LIMIT {int(page_size)} OFFSET {int(offset)}"
        )
        columns = [d[0] for d in cursor.description]
        rows = [[to_json_value(v) for v in row] for row in cursor.fetchall()]
        return {"columns": columns, "rows": rows, "total": total}
    finally:
        cursor.close()
        conn.close()
