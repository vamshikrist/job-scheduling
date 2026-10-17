#!/usr/bin/env bash
# Create (or update) the XSUAA instance from xs-security.json, granting the
# JOBSCHEDULER scope to the Job Scheduling instance named in vars.yml.
# Requires the "Authorization & Trust Management Service" entitlement, plan "application".
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE_NAME=job-scheduling-xsuaa
JOBSCHEDULER=$(sed -n 's/^jobscheduler_instance:[[:space:]]*//p' vars.yml | tr -d '\r"')

if [ -z "$JOBSCHEDULER" ] || [ "$JOBSCHEDULER" = "CHANGE_ME" ]; then
  echo "Set jobscheduler_instance in vars.yml to your Job Scheduling instance name (see: cf services)" >&2
  exit 1
fi
cf service "$JOBSCHEDULER" >/dev/null || { echo "Service instance '$JOBSCHEDULER' not found in this space" >&2; exit 1; }

RESOLVED=$(mktemp --suffix=.json)
trap 'rm -f "$RESOLVED"' EXIT
sed "s/__JOBSCHEDULER_INSTANCE__/$JOBSCHEDULER/" xs-security.json > "$RESOLVED"

if cf service "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "Instance $SERVICE_NAME exists, applying xs-security.json changes..."
  cf update-service "$SERVICE_NAME" -c "$RESOLVED"
else
  cf create-service xsuaa application "$SERVICE_NAME" -c "$RESOLVED"
fi

cf service "$SERVICE_NAME"
