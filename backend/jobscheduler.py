"""Client for the SAP Job Scheduling service REST API (standard plan, XSUAA auth).

API reference: https://api.sap.com/api/sap-btpjss-admin-v1/overview
"""
import os
import tempfile
import threading
import time

import requests

from config import get_jobscheduler_credentials

TIMEOUT = 30
PAGE_SIZE = 100  # maximum allowed by GET /scheduler/jobs from 2026-10-26


class JobSchedulerError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


_token = {"value": None, "expires_at": 0.0}
_token_lock = threading.Lock()


def _credentials():
    creds = get_jobscheduler_credentials()
    if not creds:
        raise JobSchedulerError("Job Scheduling service is not bound to this app", 500)
    return creds


def _write_temp(content):
    # Bindings store PEM newlines escaped as "\n"
    f = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
    f.write(content.replace("\\n", "\n"))
    f.close()
    return f.name


def _fetch_token():
    uaa = _credentials()["uaa"]
    data = {"grant_type": "client_credentials", "client_id": uaa["clientid"]}
    if uaa.get("clientsecret"):
        resp = requests.post(
            f"{uaa['url']}/oauth/token",
            data=data,
            auth=(uaa["clientid"], uaa["clientsecret"]),
            timeout=TIMEOUT,
        )
    else:
        # Binding created with credential-type x509
        cert, key = _write_temp(uaa["certificate"]), _write_temp(uaa["key"])
        try:
            resp = requests.post(
                f"{uaa['certurl']}/oauth/token", data=data, cert=(cert, key), timeout=TIMEOUT
            )
        finally:
            os.remove(cert)
            os.remove(key)
    if not resp.ok:
        raise JobSchedulerError(f"Token request failed: HTTP {resp.status_code}")
    body = resp.json()
    return body["access_token"], time.time() + body.get("expires_in", 3600)


def _access_token():
    with _token_lock:
        # Refresh a minute early so a token never expires mid-request
        if _token["value"] is None or time.time() > _token["expires_at"] - 60:
            _token["value"], _token["expires_at"] = _fetch_token()
        return _token["value"]


def _request(method, path, **kwargs):
    url = f"{_credentials()['url']}/scheduler{path}"
    headers = {"Authorization": f"Bearer {_access_token()}"}
    resp = requests.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    if not resp.ok:
        try:
            detail = resp.json().get("message") or resp.text
        except ValueError:
            detail = resp.text
        raise JobSchedulerError(f"{method} {path} failed: HTTP {resp.status_code} {detail}")
    return resp.json() if resp.content else {}


def list_jobs(job_type=None):
    """All jobs, optionally filtered to HTTP_ENDPOINT or CF_TASK. Pages through results."""
    jobs, offset = [], 0
    while True:
        params = {"page_size": PAGE_SIZE, "offset": offset}
        if job_type:
            params["jobType"] = job_type
        page = _request("GET", "/jobs", params=params)
        results = page.get("results", [])
        jobs.extend(results)
        offset += len(results)
        if not results or not page.get("next_url") or offset >= page.get("total", 0):
            return jobs


def create_http_job(name, description, action_url):
    """Create an active HTTP job with a one-time schedule that runs immediately."""
    return _request(
        "POST",
        "/jobs",
        json={
            "name": name,
            "description": description,
            "action": action_url,
            "active": True,
            "httpMethod": "POST",
            "schedules": [
                {"time": "now", "active": True, "description": "One-time run (now)"}
            ],
        },
    )


def run_now(job_id, data=None):
    """Add a one-time "now" schedule to an existing job (HTTP or CF task)."""
    body = {"time": "now", "active": True, "description": "One-time run (now) from UI"}
    if data:
        body["data"] = data
    return _request("POST", f"/jobs/{int(job_id)}/schedules", json=body)


def delete_job(job_id):
    return _request("DELETE", f"/jobs/{int(job_id)}")


def recent_runs(job_id, max_schedules=10, runs_per_schedule=5):
    """Run logs of the most recently modified schedules of a job, newest first.
    Every "Run now" adds a one-time schedule, so runs are spread across schedules."""
    schedules = _request(
        "GET", f"/jobs/{int(job_id)}/schedules", params={"page_size": 100, "offset": 0}
    ).get("results", [])
    schedules.sort(key=lambda s: s.get("modifiedAt") or "", reverse=True)

    runs = []
    for schedule in schedules[:max_schedules]:
        page = _request(
            "GET",
            f"/jobs/{int(job_id)}/schedules/{schedule['scheduleId']}/runs",
            params={"page_size": runs_per_schedule, "offset": 0},
        )
        for run in page.get("results", []):
            runs.append({**run, "scheduleId": schedule["scheduleId"],
                         "scheduleDescription": schedule.get("description")})
    runs.sort(key=lambda r: r.get("executionTimestamp") or r.get("scheduleTimestamp") or "",
              reverse=True)
    return runs


def update_run_log(job_id, schedule_id, run_id, success, message):
    """Report the outcome of an asynchronous (202 Accepted) HTTP job run."""
    return _request(
        "PUT",
        f"/jobs/{int(job_id)}/schedules/{schedule_id}/runs/{run_id}",
        json={"success": success, "message": message[:4000]},
    )
