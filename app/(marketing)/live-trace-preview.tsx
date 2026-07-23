"use client";

import { useEffect, useState } from "react";

const STAGES: { label: string; attrs: [string, string][] }[] = [
  {
    label: "Payment received · ₦4,200",
    attrs: [
      ["settlement.id", "stl_9c7299f6"],
      ["amount.ngn", "4200"],
    ],
  },
  {
    label: "Provider charged",
    attrs: [
      ["payment.provider", "mock-flutterwave"],
      ["payment.status", "accepted"],
    ],
  },
  {
    label: "Webhook resumed trace",
    attrs: [["observability.visibility", "observed"]],
  },
  {
    label: "chain.estimate_gas",
    attrs: [["chain.gas_estimate", "21000"]],
  },
  {
    label: "rpc.send_transaction",
    attrs: [
      ["rpc.provider", "celo-sepolia-proxy"],
      ["chain.id", "11142220"],
    ],
  },
  {
    label: "chain.wait_for_receipt",
    attrs: [
      ["tx.hash", "0x7a3f…9c2e"],
      ["tx.status", "success"],
    ],
  },
  {
    label: "Settlement confirmed",
    attrs: [["diagnosis.type", "none"]],
  },
];

const STEP_MS = 850;
const HOLD_MS = 1800;

export function LiveTracePreview() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev >= STAGES.length - 1 ? -1 : prev + 1));
    }, STEP_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (active !== STAGES.length - 1) return;
    const hold = setTimeout(() => setActive(-1), HOLD_MS);
    return () => clearTimeout(hold);
  }, [active]);

  const revealed = active === -1 ? [] : STAGES.slice(0, active + 1);
  const attrs = revealed.flatMap((s) => s.attrs);

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 text-left shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur sm:grid-cols-[1.1fr_0.9fr]">
      <div className="col-span-full flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-zinc-400">
          meridian.app/dashboard — live trace
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          streaming
        </span>
      </div>

      <div className="flex flex-col gap-0 p-6 sm:border-r sm:border-white/10">
        {STAGES.map((stage, i) => {
          const done = active === -1 ? false : i < active || (i === STAGES.length - 1 && active === i);
          const isActive = i === active;
          return (
            <div key={stage.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors duration-300 ${
                    done
                      ? "border-emerald-400 bg-emerald-400 text-black"
                      : isActive
                        ? "border-emerald-400 text-emerald-400"
                        : "border-white/15 text-transparent"
                  }`}
                >
                  {done ? "✓" : isActive ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  ) : null}
                </span>
                {i < STAGES.length - 1 && (
                  <span
                    className={`h-6 w-px transition-colors duration-300 ${
                      done ? "bg-emerald-400" : "bg-white/10"
                    }`}
                  />
                )}
              </div>
              <p
                className={`pb-6 font-mono text-xs transition-colors duration-300 ${
                  done || isActive ? "text-zinc-100" : "text-zinc-600"
                }`}
              >
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 p-6">
        <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Span attributes
        </p>
        <div className="flex flex-1 flex-col gap-2">
          {attrs.length === 0 && (
            <p className="text-xs text-zinc-600">Waiting for the next settlement…</p>
          )}
          {attrs.map(([key, val], i) => (
            <div
              key={key + i}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
            >
              <span className="font-mono text-zinc-500">{key}</span>
              <span className="font-mono text-zinc-200">{val}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          {[
            ["Chain", "Celo Sepolia"],
            ["Visibility", active >= 5 || active === -1 ? "observed" : "pending"],
            ["Confidence", active === STAGES.length - 1 ? "high" : "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] text-zinc-500">{label}</p>
              <p className="text-xs font-medium text-zinc-200">{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
