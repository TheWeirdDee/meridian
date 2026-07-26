import Link from "next/link";

const STACK = [
  ["Next.js 16", "Frontend — landing, /pay, /dashboard"],
  ["Express + tsx", "payment-api, mock-processor, settlement, rpc-proxy"],
  ["viem", "Real Celo Sepolia transactions — estimate gas, sign, send, wait for receipt"],
  ["OpenTelemetry SDK (Node)", "Traces, metrics, and logs from every service"],
  ["SigNoz (self-hosted via Foundry)", "Traces, Tracing Funnels, alerts, dashboards, logs — the primary interface"],
  ["Postgres", "Settlement records"],
  ["Celo Sepolia", "The one real, un-fakeable leg of the pipeline"],
];

const DIAGNOSIS_TABLE = [
  ["send ok, no receipt after N blocks", "confirmation_timeout", "low", "inferred", "no mempool visibility from provider"],
  ["estimate_gas returns revert data", "contract_revert_pre_broadcast", "high", "observed", "revert reason string"],
  ["submitted nonce < pending account nonce", "stale_nonce", "high", "observed", "getTransactionCount vs submitted nonce"],
  ["provider.charge ok, no webhook after T", "provider_stall", "medium", "inferred", "no visibility past processor boundary"],
];

const SIGNOZ_FEATURES = [
  {
    title: "Tracing Funnel",
    body: "receive_payment → provider.charge → on_confirmation → chain.settle → balance.update → merchant.notify. Shows conversion rate and drop-off point across many settlements — the fleet view.",
  },
  {
    title: "Alerts",
    body: "chain.wait_for_receipt p95 breach, provider.charge error-rate spike, and a business-framed alert: settlements delayed in the last 10 minutes.",
  },
  {
    title: "Metrics dashboard",
    body: "Per-provider p95 latency side by side, and a value-delayed gauge in NGN — the ₦ figure that makes a stall legible to a non-technical judge.",
  },
  {
    title: "Logs correlated to traces",
    body: "Structured logs at each stage carry the same trace ID, so SigNoz's trace-to-logs view connects them automatically.",
  },
  {
    title: "MCP server",
    body: "Deployed alongside SigNoz via Foundry, wired into this project's .mcp.json — used for direct trace/log investigation during development.",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-zinc-200 py-10 dark:border-zinc-800">
      <h2 className="mb-4 font-display text-2xl italic">{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="mb-2 text-xs font-medium tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
        Docs
      </p>
      <h1 className="mb-4 font-display text-4xl italic">Meridian, in full</h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        One trace, every rail. This page is the condensed technical reference —
        the source docs (<Link href="https://github.com/TheWeirdDee/meridian/blob/main/PRD.md" className="underline underline-offset-2">PRD</Link>,{" "}
        <Link href="https://github.com/TheWeirdDee/meridian/blob/main/ARCHITECTURE.md" className="underline underline-offset-2">ARCHITECTURE</Link>,{" "}
        <Link href="https://github.com/TheWeirdDee/meridian/blob/main/SIGNOZ_LAYER.md" className="underline underline-offset-2">SIGNOZ_LAYER</Link>) live in the repo.
      </p>

      <Section title="What this is">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          A company running fiat-to-crypto payments can, for the first time,
          see a stuck payment as one connected story and tell instantly which
          system failed. Meridian instruments a Nigerian-merchant settlement
          pipeline — NGN payment → processor → FX → real Celo Sepolia
          transaction — end to end with OpenTelemetry, emitting one
          distributed trace per payment into self-hosted SigNoz. The
          blockchain leg is genuinely real; everything else is a mock service
          this project owns. No LLM sits in the diagnosis path — a published
          rule table maps observed signals to a named verdict, deterministically.
        </p>
      </Section>

      <Section title="Tech stack">
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {STACK.map(([name, role], i) => (
            <div
              key={name}
              className={`flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${i > 0 ? "border-t border-zinc-100 dark:border-zinc-900" : ""}`}
            >
              <span className="text-sm font-medium sm:w-56 sm:shrink-0">{name}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{role}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Deterministic diagnosis (no LLM)">
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          A published rule table maps observed span signals to a named
          verdict with confidence and evidence. Same telemetry in, same
          verdict out — every time.
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Observed signal</th>
                <th className="px-3 py-2 font-medium">Verdict</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {DIAGNOSIS_TABLE.map((row) => (
                <tr key={row[1]} className="border-t border-zinc-100 dark:border-zinc-900">
                  {row.map((cell, i) => (
                    <td key={i} className={`px-3 py-2 ${i === 1 ? "font-mono text-emerald-700 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="The SigNoz layer">
        <div className="grid gap-4 sm:grid-cols-2">
          {SIGNOZ_FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="mb-1.5 text-sm font-medium">{f.title}</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Reproducing this deployment">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          SigNoz is self-hosted via{" "}
          <a href="https://github.com/SigNoz/foundry" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Foundry
          </a>
          . The repo includes <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">casting.yaml</code> and{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">casting.yaml.lock</code> — running{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">foundryctl cast</code> against them reproduces this exact deployment, SigNoz app plus MCP server, in one step.
        </p>
      </Section>

      <div className="flex flex-wrap gap-3 border-t border-zinc-200 pt-10 dark:border-zinc-800">
        <a
          href="https://github.com/TheWeirdDee/meridian"
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          View source on GitHub
        </a>
        <Link
          href="/dashboard"
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
        >
          Open the dashboard
        </Link>
      </div>
    </div>
  );
}
