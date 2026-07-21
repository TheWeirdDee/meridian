"use client";

import { useState } from "react";

const PAYMENT_API_URL =
  process.env.NEXT_PUBLIC_PAYMENT_API_URL ?? "http://localhost:4000";

type PayState = "idle" | "processing" | "received" | "delayed" | "error";

export default function Home() {
  const [state, setState] = useState<PayState>("idle");
  const [settlementId, setSettlementId] = useState<string | null>(null);

  async function handlePay() {
    setState("processing");
    setSettlementId(null);
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
        if (data.status === "confirmed") {
          clearInterval(interval);
          setState("received");
        } else if (data.status !== "pending") {
          // A terminal non-confirmed status (one of the diagnosis verdicts) —
          // never surface the internal name here, that's Q&A-only (see AGENTS.md).
          clearInterval(interval);
          setState("delayed");
        }
      } catch {
        // transient — keep polling
      }
    }, 1000);
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-white p-10 shadow-sm dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Meridian
        </h1>
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Pay a merchant ₦2,000
        </p>

        {state === "idle" && (
          <button
            onClick={handlePay}
            className="w-full rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Pay ₦2,000
          </button>
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
      </main>
    </div>
  );
}
