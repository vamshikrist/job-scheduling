import logging
import os
import re
import threading
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request

import jobscheduler
from config import HANA_SCHEMA, HANA_TABLE, TASK_MEMORY_MB, get_public_backend_url
from extract import run_full_extract
from hana import fetch_page
from jobscheduler import JobSchedulerError
from security import require_scope

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("app")

app = Flask(__name__)

MAX_PAGE_SIZE = 1000
JOB_TYPES = {"HTTP_ENDPOINT", "CF_TASK"}

# One extract at a time per app instance (gunicorn runs a single worker, see manifest.yml)
_extract_lock = threading.Lock()


@app.get("/health")
def health():
    # Unprotected: used by the Cloud Foundry health check
    return {"status": "UP"}


@app.get("/api/me")
@require_scope("Viewer")
def me():
    ctx = g.get("security_context")
    if ctx is None:
        return {"user": "local-dev (auth disabled)"}
    return {"user": ctx.get_logon_name(), "email": ctx.get_email()}


# ---------------------------------------------------------------- data screen


@app.get("/api/data")
@require_scope("Viewer")
def data():
    page = max(request.args.get("page", 1, type=int), 1)
    page_size = min(max(request.args.get("page_size", 100, type=int), 1), MAX_PAGE_SIZE)
    result = fetch_page(page, page_size)
    return jsonify(schema=HANA_SCHEMA, table=HANA_TABLE, page=page, page_size=page_size, **result)


# ---------------------------------------------------------------- jobs screen


@app.get("/api/jobs")
@require_scope("JobAdmin")
def list_jobs():
    job_type = request.args.get("type")
    if job_type and job_type not in JOB_TYPES:
        return jsonify(error=f"type must be one of {sorted(JOB_TYPES)}"), 400
    return jsonify(jobs=jobscheduler.list_jobs(job_type))


@app.post("/api/jobs/http")
@require_scope("JobAdmin")
def create_http_job():
    body = request.get_json(silent=True) or {}
    # Job names must not contain special characters and must be unique per instance
    prefix = re.sub(r"[^A-Za-z0-9]", "", body.get("name") or "") or "FullExtract"
    name = f"{prefix}{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
    description = (body.get("description") or "").strip() or (
        f"Full extract of {HANA_SCHEMA}.{HANA_TABLE} via HTTP endpoint"
    )
    action_url = f"{get_public_backend_url()}/job-actions/full-extract"
    job = jobscheduler.create_http_job(name, description, action_url)
    return jsonify(job), 201


@app.post("/api/jobs/<int:job_id>/run")
@require_scope("JobAdmin")
def run_job_now(job_id):
    body = request.get_json(silent=True) or {}
    data = None
    if body.get("jobType") == "CF_TASK":
        # Passed to the CF task as task parameters
        data = {"memory_in_mb": int(body.get("memory_in_mb") or TASK_MEMORY_MB)}
    return jsonify(jobscheduler.run_now(job_id, data)), 201


@app.get("/api/jobs/<int:job_id>/runs")
@require_scope("JobAdmin")
def job_runs(job_id):
    return jsonify(runs=jobscheduler.recent_runs(job_id))


@app.delete("/api/jobs/<int:job_id>")
@require_scope("JobAdmin")
def delete_job(job_id):
    jobscheduler.delete_job(job_id)
    return "", 204


# ---------------------------------------------------------------- job action
# Called by the Job Scheduler directly (not via the approuter, whose routes only
# cover /api/*). Uses asynchronous mode: answer 202 at once, run the extract in a
# background thread, then report the result with the Update Job Run Log API.


@app.post("/job-actions/full-extract")
@require_scope("JOBSCHEDULER")
def full_extract_action():
    job_id = request.headers.get("x-sap-job-id")
    schedule_id = request.headers.get("x-sap-job-schedule-id")
    run_id = request.headers.get("x-sap-job-run-id")
    if not (job_id and schedule_id and run_id):
        return jsonify(error="Missing x-sap-job-* headers; only the Job Scheduler calls this"), 400

    if not _extract_lock.acquire(blocking=False):
        # A server error tells the Job Scheduler this run failed
        return jsonify(error="Another extract is already running on this instance"), 503

    threading.Thread(
        target=_run_extract_and_report, args=(job_id, schedule_id, run_id), daemon=True
    ).start()
    return jsonify(status="accepted"), 202


def _run_extract_and_report(job_id, schedule_id, run_id):
    try:
        try:
            success, message = True, run_full_extract()["message"]
        except Exception as exc:
            log.exception("Full extract failed (job %s, run %s)", job_id, run_id)
            success, message = False, f"Extract failed: {exc}"
        try:
            jobscheduler.update_run_log(job_id, schedule_id, run_id, success, message)
        except Exception:
            log.exception("Could not update run log (job %s, run %s)", job_id, run_id)
    finally:
        _extract_lock.release()


# ---------------------------------------------------------------- errors


@app.errorhandler(JobSchedulerError)
def handle_jobscheduler_error(err):
    log.warning("Job Scheduler error: %s", err)
    return jsonify(error=str(err)), err.status


@app.errorhandler(401)
@app.errorhandler(403)
@app.errorhandler(500)
def handle_error(err):
    return jsonify(error=err.description), err.code


if __name__ == "__main__":
    # Local development only; Cloud Foundry starts the app with gunicorn (see manifest.yml)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), debug=True)
