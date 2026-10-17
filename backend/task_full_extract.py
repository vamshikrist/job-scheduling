"""Entry point for the Cloud Foundry task job.

Create the task in the Job Scheduling dashboard (CF Task Jobs > Create Job) with
  Application: job-scheduling-srv
  Command:     python task_full_extract.py

The task container has the same service bindings as the app. The exit code tells
the Job Scheduler whether the run succeeded (0) or failed (non-zero); output goes
to `cf logs job-scheduling-srv --recent`.
"""
import logging
import sys

from extract import run_full_extract


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        run_full_extract()
    except Exception:
        logging.exception("Full extract task failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
