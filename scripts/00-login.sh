#!/usr/bin/env bash
# Log in to a Cloud Foundry environment. The API endpoint is shown in the BTP cockpit:
# Subaccount > Overview > Cloud Foundry Environment > API Endpoint.
#
# Usage: ./scripts/00-login.sh                                    (prompts for endpoint)
#        CF_API=https://api.cf.ap11.hana.ondemand.com ./scripts/00-login.sh
set -euo pipefail

[ -n "${CF_API:-}" ] || read -rp "CF API endpoint (e.g. https://api.cf.ap11.hana.ondemand.com): " CF_API

cf login -a "$CF_API"
cf target
