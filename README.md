# JOB_SCHEDULING

Python (Flask) backend + Next.js frontend on SAP BTP Cloud Foundry, behind an approuter with XSUAA login.

- **Financial data screen** (`/data`): pages through `MFRS18_CORE.FINANCIAL_DATA` in HANA Cloud (via the user-provided service `my-hanadb-job`).
- **Jobs screen** (`/jobs`):
  - **HTTP job**: creates a Job Scheduling HTTP job with a one-time `now` schedule. The job calls the backend endpoint `/job-actions/full-extract`, which reads the whole table (~1M rows).
  - **CF task job**: runs a CF task job you created in the Job Scheduling dashboard. It does the same full extract, but in its own task container (`python task_full_extract.py`).
  - Lists all jobs with their recent run logs. Run now works for any job. Delete is offered for HTTP jobs only.

```
Browser ──> job-scheduling-approuter (XSUAA login)
              ├── /api/*  ──> job-scheduling-srv   (Flask, token forwarded)
              └── /*      ──> job-scheduling-ui    (static Next.js export)

Job Scheduling service
  ├── HTTP job  ──POST /job-actions/full-extract──> job-scheduling-srv   (202, then Update Run Log)
  └── CF task   ──cf run-task "python task_full_extract.py"──> job-scheduling-srv's droplet
```

Both job types call the same `run_full_extract()` in [backend/extract.py](backend/extract.py). It streams the table in batches of `EXTRACT_BATCH_SIZE` (20,000) rows, so the full table is never held in memory. **Put what you want done with the data in `process_batch()`.** It currently only counts the rows and logs progress.

## Why the HTTP job is asynchronous

The Job Scheduler waits at most 15 s for a synchronous response, and reading 1M rows takes longer. The endpoint therefore follows the service's [asynchronous mode](https://help.sap.com/docs/job-scheduling/sap-job-scheduling-service/asynchronous-mode):

1. It replies `202 Accepted` straight away.
2. It runs the extract in a background thread.
3. It reports success or failure with `PUT /scheduler/jobs/{jobId}/schedules/{scheduleId}/runs/{runId}`.

A second call arriving while an extract is running gets `503`, and the Job Scheduler records that run as failed.

The endpoint sits outside `/api`, so the approuter does not expose it. It only accepts tokens that carry the `JOBSCHEDULER` scope, and `xs-security.json` grants that scope only to your Job Scheduling instance.

## Python version

`backend/runtime.txt` holds `python-3.12.x`, the same as in my-HDB-accesstest. The buildpack picks the newest 3.12 patch it ships, so a deploy never fails because one exact patch was removed. To check what your landscape offers:

```bash
cf buildpacks | grep -i python        # buildpack version on the landscape
# then look that version up in https://github.com/cloudfoundry/python-buildpack/releases
```

If you need an exact version, pin one listed for that buildpack release, e.g. `python-3.12.<patch>`. Locally you have Python 3.13. For local runs, use a 3.12 venv so you test what CF runs: `py -3.12 -m venv .venv`.

## One-time setup

Run from Git Bash in the project root.

1. **Log in:** `./scripts/00-login.sh`
2. **Name your Job Scheduling instance:** run `cf services`, then set `jobscheduler_instance` in [vars.yml](vars.yml) to that name.
3. **XSUAA:** `./scripts/01-create-xsuaa.sh`. This creates `job-scheduling-xsuaa` and grants the `JOBSCHEDULER` scope to your Job Scheduling instance.
4. **HANA UPS:** `./scripts/02-create-hana-ups.sh`. It prompts for host, port, user and password and creates or updates `my-hanadb-job`.
5. **Deploy:** `./scripts/03-deploy.sh`. This builds `frontend/out` and runs `cf push --vars-file vars.yml`.
6. **Roles:** in the BTP cockpit, go to *Security > Users*. Assign yourself the role collection **JobScheduling_Admin** (data + jobs) or **JobScheduling_Viewer** (data only).
7. **Create the CF task job:** open the Job Scheduling dashboard and go to *CF Task Jobs > Create Job*:
   - Name: e.g. `FullExtractTask`
   - Application: `job-scheduling-srv`
   - Command: `python task_full_extract.py`
   - Activate Job: on

   Leave the schedule empty; the app's *Run now* button adds one-time schedules. *Run now* passes `{"memory_in_mb": 512}` as the task memory (editable on the screen; the default comes from `TASK_MEMORY_MB`). Make sure the space quota has room for it next to the running apps.

Open the URL printed at the end of step 5 (`https://job-scheduling-approuter-vamshi-dev.cfapps.ap11.hana.ondemand.com`).

> If you change `xs-security.json` later, re-run step 3 and then `cf restage job-scheduling-srv`.

## Configuration (backend env, set in manifest.yml)

| Variable | Default | Purpose |
|---|---|---|
| `HANA_SCHEMA` / `HANA_TABLE` | `MFRS18_CORE` / `FINANCIAL_DATA` | Table shown and extracted |
| `DATA_ORDER_BY` | *(empty)* | Column(s) for stable paging on the data screen, e.g. `ID`. Without it HANA may return pages in any order |
| `EXTRACT_BATCH_SIZE` | `20000` | Rows per fetch during the extract |
| `TASK_MEMORY_MB` | `512` | Default CF task memory for *Run now* |

## Logs

```bash
cf logs job-scheduling-srv --recent        # HTTP job extract and CF task output (task lines are tagged APP/TASK)
cf tasks job-scheduling-srv                # CF task runs and their state
```

Run logs also appear on the Jobs screen and in the Job Scheduling dashboard. The service keeps them for 15 days.

## Local development

```bash
# Backend (Python 3.12 venv recommended)
cd backend
py -3.12 -m venv .venv && source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env        # fill in HANA_* ; LOCAL_DEV_NO_AUTH=1 skips XSUAA locally
python app.py               # http://localhost:8080

# Frontend (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000, /api is proxied to :8080
```

The data screen works locally. The Jobs screen needs the Job Scheduling binding, so test it on CF.

## Project layout

```
approuter/        @sap/approuter + xs-app.json (routes, logout)
backend/
  app.py                 Flask routes (/api/*, /job-actions/full-extract)
  config.py              VCAP_SERVICES / env handling
  hana.py                HANA connection + paged query
  extract.py             full-table extract shared by both job types
  jobscheduler.py        Job Scheduling REST API client (OAuth, pagination, run logs)
  security.py            XSUAA scope checks (sap-xssec)
  task_full_extract.py   CF task entry point
frontend/         Next.js 14 (App Router, TypeScript, Tailwind), static export to out/
scripts/          login, XSUAA, HANA UPS, deploy
manifest.yml, vars.yml, xs-security.json
```
