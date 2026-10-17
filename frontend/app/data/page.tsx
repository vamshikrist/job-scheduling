"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

interface DataPage {
  schema: string;
  table: string;
  page: number;
  page_size: number;
  total: number;
  columns: string[];
  rows: unknown[][];
}

const PAGE_SIZES = [50, 100, 250, 500, 1000];

export default function DataScreen() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [data, setData] = useState<DataPage | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<DataPage>(`/api/data?page=${page}&page_size=${pageSize}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const lastPage = data ? Math.max(Math.ceil(data.total / pageSize), 1) : 1;

  // Filters the rows of the current page only; the table is too large to filter in the browser
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return data.rows;
    return data.rows.filter((row) =>
      row.some((v) => v !== null && String(v).toLowerCase().includes(needle)),
    );
  }, [data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold">Financial data</h1>
          <p className="text-sm text-slate-600">
            {data
              ? `${data.schema}.${data.table} · ${data.total.toLocaleString()} rows`
              : "Loading…"}
          </p>
        </div>
        <input
          className="input ml-auto max-w-xs"
          placeholder="Filter this page…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="input w-auto"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: "65vh" }}>
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 text-left">
            <tr>
              {data?.columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                {row.map((v, j) => (
                  <td key={j} className="whitespace-nowrap px-3 py-1.5">
                    {v === null ? <span className="text-slate-400">null</span> : String(v)}
                  </td>
                ))}
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={data.columns.length || 1}>
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <button className="btn-secondary" onClick={() => setPage(1)} disabled={loading || page === 1}>
          First
        </button>
        <button className="btn-secondary" onClick={() => setPage(page - 1)} disabled={loading || page === 1}>
          Previous
        </button>
        <span className="px-2">
          Page {page.toLocaleString()} of {lastPage.toLocaleString()}
        </span>
        <button className="btn-secondary" onClick={() => setPage(page + 1)} disabled={loading || page >= lastPage}>
          Next
        </button>
        <button className="btn-secondary" onClick={() => setPage(lastPage)} disabled={loading || page >= lastPage}>
          Last
        </button>
      </div>
    </div>
  );
}
