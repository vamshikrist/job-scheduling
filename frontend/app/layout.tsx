import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Scheduling",
  description: "FINANCIAL_DATA viewer and SAP Job Scheduling jobs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">
              Job Scheduling
            </Link>
            <Link href="/data" className="text-sm text-slate-600 hover:text-slate-900">
              Financial data
            </Link>
            <Link href="/jobs" className="text-sm text-slate-600 hover:text-slate-900">
              Jobs
            </Link>
            {/* Approuter logout endpoint (xs-app.json), not a Next.js route */}
            <a href="/do/logout" className="ml-auto text-sm text-slate-600 hover:text-slate-900">
              Sign out
            </a>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
