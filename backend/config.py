"""Reads service credentials from VCAP_SERVICES (on Cloud Foundry) or from
environment variables (local development)."""
import json
import os

if "VCAP_APPLICATION" not in os.environ:
    from dotenv import load_dotenv

    load_dotenv()

XSUAA_SERVICE_NAME = "job-scheduling-xsuaa"
HANA_SERVICE_NAME = "my-hanadb-job"

HANA_SCHEMA = os.environ.get("HANA_SCHEMA", "MFRS18_CORE").upper()
HANA_TABLE = os.environ.get("HANA_TABLE", "FINANCIAL_DATA").upper()

# Optional comma-separated column list for stable paging on the data screen, e.g. "ID"
DATA_ORDER_BY = os.environ.get("DATA_ORDER_BY", "").strip()

# Rows pulled from HANA per round trip during the full-table extract
EXTRACT_BATCH_SIZE = int(os.environ.get("EXTRACT_BATCH_SIZE", "20000"))

# Memory for the CF task container when "Run now" is pressed (task default is 1 GB)
TASK_MEMORY_MB = int(os.environ.get("TASK_MEMORY_MB", "512"))


def _vcap_services():
    return json.loads(os.environ.get("VCAP_SERVICES", "{}"))


def running_on_cf():
    return "VCAP_APPLICATION" in os.environ


def get_service_credentials(instance_name):
    """Find a bound service by instance name and return its credentials."""
    for instances in _vcap_services().values():
        for instance in instances:
            if instance.get("name") == instance_name:
                return instance["credentials"]
    return None


def get_xsuaa_credentials():
    return get_service_credentials(XSUAA_SERVICE_NAME)


def get_jobscheduler_credentials():
    """The Job Scheduling instance is found by service label, so its name only
    has to be configured in manifest.yml (via vars.yml)."""
    instances = _vcap_services().get("jobscheduler", [])
    return instances[0]["credentials"] if instances else None


def get_hana_credentials():
    creds = get_service_credentials(HANA_SERVICE_NAME)
    if creds:
        return creds
    # Local development: take the HANA login from environment variables
    return {
        "host": os.environ["HANA_HOST"],
        "port": int(os.environ.get("HANA_PORT", "443")),
        "user": os.environ["HANA_USER"],
        "password": os.environ["HANA_PASSWORD"],
    }


def get_public_backend_url():
    """Base URL the Job Scheduler uses to call this backend's job action endpoint."""
    if os.environ.get("BACKEND_PUBLIC_URL"):
        return os.environ["BACKEND_PUBLIC_URL"].rstrip("/")
    app = json.loads(os.environ.get("VCAP_APPLICATION", "{}"))
    uris = app.get("application_uris") or []
    if not uris:
        raise RuntimeError("Cannot determine backend URL; set BACKEND_PUBLIC_URL")
    return f"https://{uris[0]}"
