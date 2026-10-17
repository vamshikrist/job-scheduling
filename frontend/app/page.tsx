import Link from "next/link";

export default function Home() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/data" className="card hover:border-blue-400">
        <h2 className="font-semibold">Financial data</h2>
        <p className="mt-1 text-sm text-slate-600">
          Browse MFRS18_CORE.FINANCIAL_DATA from SAP HANA Cloud.
        </p>
      </Link>
      <Link href="/jobs" className="card hover:border-blue-400">
        <h2 className="font-semibold">Jobs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Create and run the full-extract HTTP job, or run the Cloud Foundry task job.
        </p>
      </Link>
    </div>
  );
}
