"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const PAYMENT_API_URL =
  process.env.NEXT_PUBLIC_PAYMENT_API_URL ?? "http://localhost:4000";
const SIGNOZ_URL = process.env.NEXT_PUBLIC_SIGNOZ_URL ?? "http://localhost:8080";

interface Settlement {
  id: string;
  merchantId: string;
  amountNgn: number;
  status: string;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
}

const IN_FLIGHT = new Set(["pending", "processing"]);

// The deterministic diagnosis vocabulary (packages/otel/conventions.ts) —
// shown plainly here on purpose. This is the ops view built specifically to
// surface what the merchant-facing /pay screen deliberately does not.
const DIAGNOSIS_LABEL: Record<string, string> = {
  contract_revert_pre_broadcast: "Contract revert (pre-broadcast)",
  provider_stall: "Provider stall",
  confirmation_timeout: "Confirmation timeout",
  stale_nonce: "Stale nonce",
};

type Filter = "all" | "confirmed" | "in_flight" | "stalled";

function classify(status: string): Exclude<Filter, "all"> {
  if (status === "confirmed") return "confirmed";
  if (IN_FLIGHT.has(status)) return "in_flight";
  return "stalled";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
        Confirmed
      </span>
    );
  }
  if (IN_FLIGHT.has(status)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
        {status === "pending" ? "Pending" : "Processing"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
      {DIAGNOSIS_LABEL[status] ?? status}
    </span>
  );
}

function fmtNgn(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DashboardPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${PAYMENT_API_URL}/settlements?limit=50`);
        const data = await res.json();
        if (!cancelled) {
          setSettlements(data.settlements ?? []);
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const confirmed = settlements.filter((s) => classify(s.status) === "confirmed");
  const inFlight = settlements.filter((s) => classify(s.status) === "in_flight");
  const stalled = settlements.filter((s) => classify(s.status) === "stalled");
  const valueDelayed = stalled.reduce((sum, s) => sum + s.amountNgn, 0);

  const visible = useMemo(() => {
    return settlements.filter((s) => {
      if (filter !== "all" && classify(s.status) !== filter) return false;
      if (query && !s.id.includes(query) && !s.merchantId.includes(query)) return false;
      return true;
    });
  }, [settlements, filter, query]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: settlements.length },
    { key: "confirmed", label: "Confirmed", count: confirmed.length },
    { key: "in_flight", label: "In flight", count: inFlight.length },
    { key: "stalled", label: "Stalled", count: stalled.length },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Settlement overview</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every row below is a real settlement moving through the same trace
            SigNoz is watching — nothing here is a mock summary.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            live · refreshes every 3s
          </span>
          <Link
            href="/pay"
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Make a payment
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Settlements shown" value={String(settlements.length)} />
        <StatCard label="Confirmed" value={String(confirmed.length)} accent="text-green-600 dark:text-green-400" />
        <StatCard label="In flight" value={String(inFlight.length)} accent="text-zinc-600 dark:text-zinc-300" />
        <StatCard
          label="Value delayed"
          value={fmtNgn(valueDelayed)}
          accent="text-amber-600 dark:text-amber-400"
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === t.key
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {t.label} <span className="opacity-60">{t.count}</span>
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by settlement or merchant id…"
            className="w-full max-w-xs rounded-lg border border-zinc-200 bg-transparent px-3 py-1.5 text-xs placeholder:text-zinc-400 focus:outline-none dark:border-zinc-800"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Settlement</th>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Trace</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {s.id}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{s.merchantId}</td>
                  <td className="px-4 py-3 font-medium">{fmtNgn(s.amountNgn)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {fmtTime(s.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {s.traceId ? (
                      <a
                        href={`${SIGNOZ_URL}/trace/${s.traceId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-black underline underline-offset-2 dark:text-white"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-300 dark:text-zinc-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                    {settlements.length === 0
                      ? "No settlements yet — make a payment to see one appear here in real time."
                      : "No settlements match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500">
          Couldn&apos;t reach payment-api — is it running on :4000?
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
