"use client";

import { useState } from "react";
import Link from "next/link";

const PAYMENT_API_URL =
  process.env.NEXT_PUBLIC_PAYMENT_API_URL ?? "http://localhost:4000";
const SIGNOZ_URL = process.env.NEXT_PUBLIC_SIGNOZ_URL ?? "http://localhost:8080";

type PayState = "idle" | "processing" | "received" | "delayed" | "error";

export default function PayPage() {
  const [state, setState] = useState<PayState>("idle");
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  async function handlePay() {
    setState("processing");
    setSettlementId(null);
    setTraceId(null);
    try {
      const res = await fetch(`${PAYMENT_API_URL}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountNgn: 2000 }),
      });
      const data = await res.json();
      setSettlementId(data.settlementId);
      pollStatus(data.settlementId);
    } catch {
      setState("error");
    }
  }

  function pollStatus(id: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${PAYMENT_API_URL}/status/${id}`);
        const data = await res.json();
        if (data.traceId) setTraceId(data.traceId);
        if (data.status === "confirmed") {
          clearInterval(interval);
          setState("received");
        } else if (data.status !== "pending" && data.status !== "processing") {
          // A terminal non-confirmed status (one of the diagnosis verdicts) —
          // never surface the internal name here, that's Q&A-only (see AGENTS.md).
          // "processing" is a transient in-flight status (see log.md Phase 3),
          // not a terminal one — must not be treated as a failure here.
          clearInterval(interval);
          setState("delayed");
        }
      } catch {
        // transient — keep polling
      }
    }, 1000);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-16 font-sans dark:bg-zinc-950">
      <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-600">
        Live demo — a real Celo Sepolia settlement, not simulated
      </p>

      <main className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-white p-10 shadow-sm dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Pay a merchant
        </h1>
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          ₦2,000 · fiat rail → processor → webhook → Celo Sepolia
        </p>

        {state === "idle" && (
          <>
            <button
              onClick={handlePay}
              className="w-full rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Pay ₦2,000
            </button>
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
              This fires a real payment through every hop — including an actual
              on-chain transaction — traced end to end.
            </p>
          </>
        )}

        {state === "processing" && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-black dark:border-zinc-700 dark:border-t-white" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Processing…
            </p>
          </div>
        )}

        {state === "received" && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">✓</div>
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Received
            </p>
          </div>
        )}

        {state === "delayed" && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">⏱</div>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Taking longer than expected
            </p>
          </div>
        )}

        {state === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Something went wrong. Try again.
          </p>
        )}

        {settlementId && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600">
            {settlementId}
          </p>
        )}

        {(state === "received" || state === "delayed") && (
          <div className="flex gap-4 text-xs">
            <Link
              href="/dashboard"
              className="font-medium text-black underline underline-offset-2 dark:text-white"
            >
              View in dashboard
            </Link>
            {traceId && (
              <a
                href={`${SIGNOZ_URL}/trace/${traceId}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-black underline underline-offset-2 dark:text-white"
              >
                View trace in SigNoz
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
