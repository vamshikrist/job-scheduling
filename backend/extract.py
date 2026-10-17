"""Full-table extract of FINANCIAL_DATA.

Shared by both job types so they do exactly the same work:
  - HTTP job:    Job Scheduler -> POST /job-actions/full-extract (runs in the web app)
  - CF task job: Job Scheduler -> `python task_full_extract.py` (runs in its own container)
"""
import logging
import time

from config import EXTRACT_BATCH_SIZE, HANA_SCHEMA, HANA_TABLE
from hana import TABLE_REF, connect

log = logging.getLogger(__name__)


def process_batch(columns, rows):
    """Hook for what to do with each batch of rows (transform, aggregate, write
    somewhere...). Rows are streamed, so the full table is never held in memory."""


def run_full_extract():
    started = time.monotonic()
    total = 0
    conn = connect()
    cursor = conn.cursor()
    try:
        # Rows per network round trip; hdbcli's default (32) is far too small for 1M rows
        cursor.setfetchsize(EXTRACT_BATCH_SIZE)
        cursor.execute(f"SELECT * FROM {TABLE_REF}")
        columns = [d[0] for d in cursor.description]
        log.info("Extract of %s.%s started (%d columns)", HANA_SCHEMA, HANA_TABLE, len(columns))

        while True:
            rows = cursor.fetchmany(EXTRACT_BATCH_SIZE)
            if not rows:
                break
            process_batch(columns, rows)
            total += len(rows)
            log.info("  %d rows fetched (%.1fs)", total, time.monotonic() - started)
    finally:
        cursor.close()
        conn.close()

    seconds = round(time.monotonic() - started, 1)
    summary = f"Fetched {total} rows from {HANA_SCHEMA}.{HANA_TABLE} in {seconds}s"
    log.info(summary)
    return {"rows": total, "columns": len(columns), "seconds": seconds, "message": summary}
