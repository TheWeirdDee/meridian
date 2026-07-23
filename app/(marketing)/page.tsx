import Link from "next/link";
import { LiveTracePreview } from "./live-trace-preview";
import { HyperspeedBackground } from "./hyperspeed-background";
import { ArchitectureSection } from "./architecture-section";

const STACK = ["Celo Sepolia", "SigNoz", "OpenTelemetry", "viem", "Next.js"];

const FEATURES = [
  {
    title: "The chain leg is real",
    body: "Every settlement is an actual viem transaction against a deployed contract on Celo Sepolia — not a simulated delay. Take any trace's tx hash to the explorer yourself.",
  },
  {
    title: "One trace across the async gap",
    body: "The payment webhook arrives on a different request, seconds later, with no shared process state. Context is restored explicitly, so fiat charge to on-chain receipt is one connected trace, not two.",
  },
  {
    title: "Deterministic diagnosis, no LLM",
    body: "When a settlement stalls, a fixed rule table classifies why from the actual signals observed — same signals in, same verdict out, every time.",
  },
  {
    title: "Observed vs. inferred, honestly",
    body: "Every diagnosis is labeled with what was actually seen versus what's inferred past a real visibility boundary, plus a confidence level — never a guess dressed up as certainty.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Trigger a payment",
    body: "One click on /pay fires a real charge through the mock processor — the same shape a real Flutterwave/Paystack webhook would take.",
  },
  {
    n: "02",
    title: "The trace resumes across the gap",
    body: "Seconds later, the webhook lands on a different request. Meridian restores the original trace context explicitly, rather than starting a new one.",
  },
  {
    n: "03",
    title: "Watch it settle on Celo Sepolia",
    body: "A real transaction is estimated, signed, sent, and confirmed — or, deterministically diagnosed if it doesn't. Both outcomes show up live on the dashboard.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center gap-6 overflow-hidden px-6 py-20 text-center text-white">
        <HyperspeedBackground />

        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-black/40 px-3 py-1 text-xs text-emerald-400 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live on Celo Sepolia — not a simulation
        </span>

        <h1 className="max-w-3xl font-display text-4xl leading-[1.1] font-medium tracking-tight sm:text-6xl">
          Watch a payment become
          <br />
          on-chain settlement,{" "}
          <span className="text-emerald-400 italic">fully traced.</span>
        </h1>

        <p className="max-w-xl text-balance text-zinc-300">
          Meridian instruments a real Naira-to-stablecoin settlement flow —
          payment processor, an async webhook, and a genuine Celo Sepolia
          transaction — as a single connected trace in SigNoz. When something
          stalls, it says exactly where, with real evidence, not a guess.
        </p>

        <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
          >
            Open the live dashboard →
          </Link>
          <Link
            href="/pay"
            className="text-sm font-medium text-zinc-300 underline underline-offset-4 transition-colors hover:text-white"
          >
            Or make a ₦2,000 test payment
          </Link>
        </div>

        <div className="mt-8 flex w-full justify-center px-2">
          <LiveTracePreview />
        </div>
      </section>

      <section className="border-y border-zinc-200 px-6 py-8 dark:border-zinc-800">
        <p className="mb-5 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Built on real, verifiable infrastructure
        </p>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-zinc-400 dark:text-zinc-600">
          {STACK.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>

      <ArchitectureSection />

      <section className="px-6 py-20">
        <h2 className="mb-2 text-center font-display text-3xl italic">
          Four things a normal payment trace can't do
        </h2>
        <p className="mb-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          What makes this different, mechanically.
        </p>
        <div className="mx-auto grid max-w-4xl gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`bg-white p-8 dark:bg-zinc-950 ${i === 0 ? "sm:pt-8" : ""}`}
            >
              <p className="mb-3 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mb-2 font-medium">{f.title}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 px-6 py-20 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-center font-display text-3xl italic">
          See it happen in three steps
        </h2>
        <p className="mb-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No setup needed — this is running against a real testnet right now.
        </p>
        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-3 font-mono text-xs text-emerald-700 dark:text-emerald-400">{s.n}</p>
              <h3 className="mb-2 font-medium">{s.title}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-5 border-t border-zinc-200 px-6 py-20 text-center dark:border-zinc-800">
        <h2 className="font-display text-3xl italic">See it for yourself</h2>
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          Trigger a real settlement, then watch it land — in the dashboard and
          in SigNoz — as a single trace, with a real transaction hash at the
          end of it.
        </p>
        <Link
          href="/pay"
          className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Make a test payment
        </Link>
      </section>
    </div>
  );
}
