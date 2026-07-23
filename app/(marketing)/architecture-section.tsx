const PIPELINE = [
  {
    n: 1,
    title: "RECEIVE",
    span: "settlement.receive_payment",
    body: "Customer taps pay. payment-api creates the settlement record — root span starts here.",
  },
  {
    n: 2,
    title: "CHARGE",
    span: "payment.provider.charge",
    body: "The mock processor charges the customer — the observed boundary before the async gap.",
  },
  {
    n: 3,
    title: "WEBHOOK GAP",
    span: "⋯ async gap ⋯",
    body: "The webhook lands seconds later, on a different request, no shared process state. Context is restored explicitly via a span link — not started over.",
  },
  {
    n: 4,
    title: "RESUME",
    span: "settlement.on_confirmation",
    body: "The original trace resumes. This is the hard part most tracers get wrong silently.",
  },
  {
    n: 5,
    title: "CONVERT",
    span: "fx.convert",
    body: "NGN → cUSD. Mocked, deliberately — this leg isn't the differentiator.",
  },
  {
    n: 6,
    title: "SETTLE",
    span: "chain.settle",
    body: "Real viem transaction on Celo Sepolia: estimate gas, read nonce, sign, send, wait for receipt. The one un-fakeable component.",
  },
  {
    n: 7,
    title: "DIAGNOSE",
    span: "diagnosis.type / .confidence / .evidence",
    body: "If it stalls: a published rule table maps the observed signals to a named verdict. No LLM — same signals in, same verdict out.",
  },
  {
    n: 8,
    title: "NOTIFY",
    span: "balance.update · merchant.notify",
    body: "Balance updates, merchant is notified — the phone flips to ✓.",
  },
];

const COMPARISON = [
  ["Five siloed systems, five sets of logs (or none)", "One trace, one payment, start to finish"],
  ["An engineer cross-references timestamps by hand", "One connected story — tap it, see it"],
  ["\"We don't know where your money is.\"", "An answer in two seconds"],
  ["Black box past the processor boundary", "Observed vs. inferred, labeled on every span"],
];

const TRACE_TREE = [
  { depth: 0, name: "settlement.receive_payment", tag: null },
  { depth: 1, name: "payment.create_record", tag: null },
  { depth: 1, name: "payment.provider.charge", tag: "observed" },
  { depth: 0, name: "⋯ webhook gap — context bridged via span link ⋯", tag: null, muted: true },
  { depth: 1, name: "settlement.on_confirmation", tag: null },
  { depth: 2, name: "fx.convert", tag: null },
  { depth: 2, name: "chain.settle", tag: null },
  { depth: 3, name: "chain.estimate_gas", tag: null },
  { depth: 3, name: "chain.read_nonce", tag: null },
  { depth: 3, name: "wallet.sign", tag: null },
  { depth: 3, name: "rpc.send_transaction", tag: "observed" },
  { depth: 3, name: "chain.wait_for_receipt", tag: "observed→inferred" },
  { depth: 2, name: "balance.update", tag: null },
  { depth: 2, name: "merchant.notify", tag: null },
];

export function ArchitectureSection() {
  return (
    <section id="flow" className="bg-zinc-50 px-6 py-20 dark:bg-zinc-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold tracking-wide text-white uppercase dark:bg-white dark:text-black">
            Meridian architecture
          </span>
          <h2 className="font-display text-2xl italic sm:text-3xl">
            One payment, seen the way it actually happens
          </h2>
          <p className="max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            This is the whole point: the parts of a settlement nobody normally
            sees — the async gap, the chain leg, the exact moment something
            stalls — made visible, in order.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
          <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900/40 dark:bg-red-950/20">
            <p className="text-xs font-semibold tracking-wide text-red-700 uppercase dark:text-red-400">
              Status quo
            </p>
            {[
              "Customer pays",
              "Crosses 5–6 systems, each with its own logs — or none",
              "Support checks five dashboards, guesses from timestamps",
              "\"We don't know where your money is.\"",
            ].map((line, i, arr) => (
              <div key={line} className="flex flex-col gap-1">
                <p className="text-sm text-red-900 dark:text-red-200">{line}</p>
                {i < arr.length - 1 && (
                  <span className="text-red-300 dark:text-red-800">↓</span>
                )}
              </div>
            ))}
            <div className="mt-2 rounded-lg border border-dashed border-red-300 p-2 text-xs text-red-700 dark:border-red-800 dark:text-red-400">
              ⟲ Merchant refreshes, assumes they've been scammed, churns.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PIPELINE.map((step) => (
              <div
                key={step.n}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-semibold text-white dark:bg-emerald-500 dark:text-black">
                    {step.n}
                  </span>
                  <p className="text-xs font-semibold tracking-wide">{step.title}</p>
                </div>
                <p className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                  {step.span}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-2 bg-zinc-900 text-xs font-semibold tracking-wide text-white uppercase dark:bg-white dark:text-black">
            <p className="px-4 py-2">Status quo</p>
            <p className="px-4 py-2">Meridian</p>
          </div>
          {COMPARISON.map(([before, after]) => (
            <div key={before} className="grid grid-cols-2 border-t border-zinc-200 text-sm dark:border-zinc-800">
              <p className="border-r border-zinc-200 px-4 py-3 text-red-700 dark:border-zinc-800 dark:text-red-400">
                {before}
              </p>
              <p className="px-4 py-3 text-emerald-700 dark:text-emerald-400">{after}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 text-[11px] text-zinc-400">
              Not a mockup — the real span tree, attribute names included
            </span>
          </div>
          <div className="p-5 font-mono text-xs">
            {TRACE_TREE.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-0.5"
                style={{ paddingLeft: `${row.depth * 1.25}rem` }}
              >
                <span className={row.muted ? "text-zinc-600 italic" : "text-zinc-200"}>
                  {row.depth > 0 ? "└─ " : ""}
                  {row.name}
                </span>
                {row.tag && (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                    {row.tag}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
