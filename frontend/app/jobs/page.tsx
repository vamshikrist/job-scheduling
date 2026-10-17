"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Job, jobIdOf, Run } from "@/lib/api";

const RUNS_REFRESH_MS = 10_000;

const TYPE_LABEL: Record<string, string> = { HTTP_ENDPOINT: "HTTP", CF_TASK: "CF task" };

export default function JobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // HTTP job form
  const [httpName, setHttpName] = useState("FullExtract");
  const [httpDescription, setHttpDescription] = useState("");

  // CF task form
  const [taskId, setTaskId] = useState<number | "">("");
  const [taskMemory, setTaskMemory] = useState(512);

  const [selected, setSelected] = useState<Job | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const tasks = jobs.filter((j) => j.jobType === "CF_TASK");

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const { jobs } = await api<{ jobs: Job[] }>("/api/jobs");
      setJobs(jobs);
      setTaskId((current) => {
        const firstTask = jobs.find((j) => j.jobType === "CF_TASK");
        return current === "" && firstTask ? jobIdOf(firstTask) : current;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const loadRuns = useCallback(async (job: Job) => {
    try {
      const { runs } = await api<{ runs: Run[] }>(`/api/jobs/${jobIdOf(job)}/runs`);
      setRuns(runs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Poll the run log of the selected job so status changes show up without clicking
  useEffect(() => {
    if (!selected) return;
    loadRuns(selected);
    const timer = setInterval(() => loadRuns(selected), RUNS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, loadRuns]);

  async function act(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const createHttpJob = () =>
    act(async () => {
      const job = await api<Job>("/api/jobs/http", {
        method: "POST",
        body: JSON.stringify({ name: httpName, description: httpDescription }),
      });
      await loadJobs();
      setSelected(job);
      return `HTTP job "${job.name}" (ID ${jobIdOf(job)}) created and scheduled to run now.`;
    });

  const runNow = (job: Job, memory?: number) =>
    act(async () => {
      await api(`/api/jobs/${jobIdOf(job)}/run`, {
        method: "POST",
        body: JSON.stringify({ jobType: job.jobType, memory_in_mb: memory }),
      });
      setSelected(job);
      return `"${job.name}" scheduled to run now.`;
    });

  const deleteJob = (job: Job) => {
    if (!confirm(`Delete job "${job.name}" with all its schedules and run logs?`)) return;
    act(async () => {
      await api(`/api/jobs/${jobIdOf(job)}`, { method: "DELETE" });
      if (selected && jobIdOf(selected) === jobIdOf(job)) setSelected(null);
      await loadJobs();
      return `Job "${job.name}" deleted.`;
    });
  };

  const selectedTask = tasks.find((t) => jobIdOf(t) === taskId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Jobs</h1>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <div>
            <h2 className="font-semibold">HTTP job: full table extract</h2>
            <p className="text-sm text-slate-600">
              Creates a Job Scheduler HTTP job that calls the backend endpoint, which reads the
              whole FINANCIAL_DATA table. Runs once, now.
            </p>
          </div>
          <label className="block text-sm">
            Job name prefix <span className="text-slate-500">(a timestamp is appended)</span>
            <input className="input mt-1" value={httpName} onChange={(e) => setHttpName(e.target.value)} />
          </label>
          <label className="block text-sm">
            Description <span className="text-slate-500">(optional)</span>
            <input
              className="input mt-1"
              value={httpDescription}
              onChange={(e) => setHttpDescription(e.target.value)}
            />
          </label>
          <button className="btn-primary" onClick={createHttpJob} disabled={busy}>
            Create &amp; run now
          </button>
        </section>

        <section className="card space-y-3">
          <div>
            <h2 className="font-semibold">Cloud Foundry task job</h2>
            <p className="text-sm text-slate-600">
              Runs a CF task job created in the Job Scheduling dashboard. It does the same full
              extract in its own container.
            </p>
          </div>
          {tasks.length === 0 ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {loadingJobs ? "Loading…" : (
                <>
                  No CF task jobs found. Create one in the Job Scheduling dashboard under{" "}
                  <em>CF Task Jobs</em> with application <code>job-scheduling-srv</code> and
                  command <code>python task_full_extract.py</code>, then refresh.
                </>
              )}
            </p>
          ) : (
            <>
              <label className="block text-sm">
                Task job
                <select
                  className="input mt-1"
                  value={taskId}
                  onChange={(e) => setTaskId(Number(e.target.value))}
                >
                  {tasks.map((t) => (
                    <option key={jobIdOf(t)} value={jobIdOf(t)}>
                      {t.name} (ID {jobIdOf(t)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Task memory (MB)
                <input
                  className="input mt-1"
                  type="number"
                  min={256}
                  step={256}
                  value={taskMemory}
                  onChange={(e) => setTaskMemory(Number(e.target.value))}
                />
              </label>
              <button
                className="btn-primary"
                onClick={() => selectedTask && runNow(selectedTask, taskMemory)}
                disabled={busy || !selectedTask}
              >
                Run now
              </button>
            </>
          )}
        </section>
      </div>

      <section className="card space-y-3">
        <div className="flex items-center">
          <h2 className="font-semibold">All jobs</h2>
          <button className="btn-secondary ml-auto" onClick={loadJobs} disabled={loadingJobs}>
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const isSelected = selected && jobIdOf(selected) === jobIdOf(job);
                return (
                  <tr key={jobIdOf(job)} className={`border-t border-slate-100 ${isSelected ? "bg-blue-50" : ""}`}>
                    <td className="px-3 py-1.5">{jobIdOf(job)}</td>
                    <td className="px-3 py-1.5">
                      <div>{job.name}</div>
                      {job.description && <div className="text-xs text-slate-500">{job.description}</div>}
                    </td>
                    <td className="px-3 py-1.5">{TYPE_LABEL[job.jobType ?? ""] ?? job.jobType ?? "-"}</td>
                    <td className="px-3 py-1.5">{job.active ? "Yes" : "No"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{job.createdAt ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right space-x-2">
                      <button className="btn-secondary" onClick={() => setSelected(job)}>
                        Runs
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => runNow(job, job.jobType === "CF_TASK" ? taskMemory : undefined)}
                        disabled={busy}
                      >
                        Run now
                      </button>
                      {job.jobType !== "CF_TASK" && (
                        <button className="btn-danger" onClick={() => deleteJob(job)} disabled={busy}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && !loadingJobs && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No jobs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="card space-y-3">
          <div className="flex items-center">
            <h2 className="font-semibold">
              Recent runs: {selected.name}{" "}
              <span className="text-sm font-normal text-slate-500">(refreshes every 10 s)</span>
            </h2>
            <button className="btn-secondary ml-auto" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Executed (UTC)</th>
                  <th className="px-3 py-2 font-medium">Completed (UTC)</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">HTTP</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.runId} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-1.5">{run.executionTimestamp ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{run.completionTimestamp ?? "-"}</td>
                    <td className="px-3 py-1.5">{run.runStatus ?? "-"}</td>
                    <td className="px-3 py-1.5">
                      <span className={stateClass(run.runState)}>{run.runState ?? "-"}</span>
                    </td>
                    <td className="px-3 py-1.5">{run.httpStatus ?? "-"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{run.runText ?? ""}</td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No runs yet. A "now" schedule can take up to a minute to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function stateClass(state?: string) {
  if (state === "SUCCESS" || state === "COMPLETED") return "font-medium text-green-700";
  if (state?.includes("ERROR") || state === "FAILED") return "font-medium text-red-700";
  return "text-slate-700";
}
