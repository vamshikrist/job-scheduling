#!/usr/bin/env bash
# Store the HANA Cloud login in a user-provided service (UPS) in the currently targeted
# CF org/space, so it never lives in code or git. Nothing is hardcoded here.
#
# Interactive:      ./scripts/02-create-hana-ups.sh          (prompts for each value)
# Non-interactive:  HANA_HOST=... HANA_USER=... HANA_PASSWORD=... ./scripts/02-create-hana-ups.sh
set -euo pipefail

SERVICE_NAME=my-hanadb-job

echo "Target: $(cf target | grep -Ei 'org|space' | tr -s ' ' | paste -sd ' ')"

[ -n "${HANA_HOST:-}" ]     || read -rp  "HANA host (e.g. <id>.hana.prod-<region>.hanacloud.ondemand.com): " HANA_HOST
[ -n "${HANA_PORT:-}" ]     || { read -rp "HANA port [443]: " HANA_PORT; HANA_PORT=${HANA_PORT:-443}; }
[ -n "${HANA_USER:-}" ]     || read -rp  "HANA user: " HANA_USER
[ -n "${HANA_PASSWORD:-}" ] || { read -rsp "HANA password: " HANA_PASSWORD; echo; }

# Build the JSON with Python so quotes or backslashes in the password can't break it
CREDS=$(HANA_HOST="$HANA_HOST" HANA_PORT="$HANA_PORT" HANA_USER="$HANA_USER" HANA_PASSWORD="$HANA_PASSWORD" \
  python -c 'import json,os; print(json.dumps({
    "host": os.environ["HANA_HOST"],
    "port": int(os.environ["HANA_PORT"]),
    "user": os.environ["HANA_USER"],
    "password": os.environ["HANA_PASSWORD"],
  }))')

if cf service "$SERVICE_NAME" >/dev/null 2>&1; then
  cf update-user-provided-service "$SERVICE_NAME" -p "$CREDS"
  echo "Updated. Restage the backend to pick up changes: cf restage job-scheduling-srv"
else
  cf create-user-provided-service "$SERVICE_NAME" -p "$CREDS"
fi

cf service "$SERVICE_NAME"
