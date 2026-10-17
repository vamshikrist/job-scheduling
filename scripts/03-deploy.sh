#!/usr/bin/env bash
# Build the Next.js static export, then push all three apps from manifest.yml.
# The manifest binds job-scheduling-xsuaa, my-hanadb-job and the Job Scheduling
# instance from vars.yml, so run scripts 01 and 02 first.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd frontend && npm ci && npm run build)

cf push -f manifest.yml --vars-file vars.yml

echo
echo "Open the app through the approuter:"
cf app job-scheduling-approuter | grep -i routes
