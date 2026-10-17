// Calls the backend through the approuter (same origin). The approuter requires a
// CSRF token for non-GET requests: fetched once with "x-csrf-token: Fetch".

let csrfToken: string | null = null;

async function fetchCsrfToken() {
  const res = await fetch("/api/me", { headers: { "x-csrf-token": "Fetch" } });
  csrfToken = res.headers.get("x-csrf-token");
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();

  const send = () => {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (method !== "GET" && csrfToken) headers.set("x-csrf-token", csrfToken);
    return fetch(path, { ...init, method, headers });
  };

  if (method !== "GET" && !csrfToken) await fetchCsrfToken();
  let res = await send();
  if (res.status === 403 && res.headers.get("x-csrf-token")?.toLowerCase() === "required") {
    await fetchCsrfToken(); // token expired with the session
    res = await send();
  }

  if (res.status === 204) return null as T;
  if (!res.headers.get("content-type")?.includes("application/json")) {
    // The approuter answers with its login page once the session has expired
    throw new Error("Your session has expired. Reload the page to sign in again.");
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (HTTP ${res.status})`);
  return body as T;
}

export interface Job {
  _id?: number;
  jobId?: number;
  name: string;
  description?: string;
  jobType?: "HTTP_ENDPOINT" | "CF_TASK";
  active: boolean;
  action?: string;
  createdAt?: string;
}

export interface Run {
  runId: string;
  scheduleId: string;
  scheduleDescription?: string;
  runStatus?: string;
  runState?: string;
  runText?: string;
  httpStatus?: number;
  scheduleTimestamp?: string;
  executionTimestamp?: string;
  completionTimestamp?: string;
}

// Create responses carry "_id"; list responses may carry both
export const jobIdOf = (job: Job) => (job._id ?? job.jobId) as number;
