# MERIDIAN — Product Requirements

> **One trace, every rail.** Follow a single payment from a fiat rail to final on-chain settlement, as one distributed trace, in SigNoz.

*Working name: **Meridian**. Plainer, more judge-legible alternatives if you want them: **RailTrace**, **SettlementLens**. Pick one and lock it before Phase 0 — the name appears in every artifact.*

Hackathon: Agents of SigNoz (SigNoz × WeMakeDevs), Jul 20–26 2026.
Primary track: **02 — Signals & Dashboards** (custom OTel instrumentation + Query Builder). Also defensible under **03 — Build Your Own** (bridge an unsupported data source).

---

## 1. The use case (who this is for, and the money problem)

**Who.** Any company running a payment that begins in ordinary money and ends on a blockchain: stablecoin merchant settlement, crypto payouts, cross-border payroll, remittances, treasury automation. The concrete instance we build and demo is a **Nigerian merchant getting paid**: a customer pays in NGN, it converts to a stablecoin (cUSD), it settles on-chain (Celo), the merchant is credited.

**The problem, stated as money — not as "observability is nice."** When one of these payments stalls, the company's support team gets *"where is my money?"* **and cannot answer it.** The payment crossed five or six systems — a payment processor, the company's own backend, an FX step, a wallet, an RPC provider, the chain itself — each with its own separate logs, or none. So an engineer checks five dashboards, cross-references timestamps, and guesses. Meanwhile the merchant refreshes, assumes they were scammed, and churns. Every minute of *"we don't know"* is a support cost and a trust cost.

**What Meridian changes.** Instead of five siloed systems and a guess, there is **one trace per payment**. Open it and see in two seconds: NGN received ✓, converted ✓, wallet signed ✓, chain confirmation stuck at 47s ⚠. The unanswerable question becomes answerable instantly. At fleet scale a Funnel shows *"127 payments stalled at the chain step in the last 10 minutes"* — so degradation is caught **before** 127 merchants complain, not after.

**One-sentence use case:** *A company running fiat-to-crypto payments can, for the first time, see a stuck payment as one connected story and tell instantly which system failed — turning "we don't know where your money is" into a two-second answer.*

---

## 2. What Meridian is (and is not)

Meridian is **an observability project**, not a payment app and not a blockchain explorer. The payment pipeline exists only as the environment to be observed — exactly as Kubernetes is the environment in most observability demos.

- **It is:** a small payment pipeline instrumented end-to-end with OpenTelemetry, emitting one distributed trace per payment into self-hosted SigNoz, with a deterministic diagnosis layer, Tracing Funnels, alerts, and metrics.
- **It is not:** a viem wrapper, an AI-that-summarizes-traces, a chat-with-your-logs, or a real payment integration. **No LLM sits in the diagnosis path.**

The interesting artifact is the **single trace crossing the fiat→chain boundary** — a span sequence SigNoz's own showcase material has never demonstrated. The blockchain is *one span among many*, which is exactly why this is not "just a wrapper."

---

## 3. Scope rules (decided — do not reopen)

1. **Mock everything except the chain leg.** The payment processor, FX, and merchant notification are mock services you own. The **blockchain leg is real** — real viem, real Celo Alfajores testnet, real tx hash, real confirmation wait. The chain leg is the one un-fakeable component; it is the entire differentiator. Everything else is cardboard; that one part is load-bearing steel.
2. **Failures are injected as real conditions, discovered by instrumentation — never hardcoded effects.** You inject the *cause* (a genuinely slow/failing RPC endpoint, a contract call that genuinely reverts, a webhook that genuinely never arrives); the instrumentation *discovers* the effect. Never `sleep(47000)` a fake stall. A judge who spots a hardcoded effect deflates the whole demo. This shapes how every mock is written — decide it in Phase 0.
3. **One chain only: Celo.** The multi-chain angle is dead. Depth on one beats breadth on five.
4. **Blockchain internals stay out of the demo narration.** The word "nonce" is never spoken on stage. Diagnosis rigor lives nested in the trace and is *revealed on demand* in Q&A, not narrated.
5. **Observed vs inferred is first-class in the span schema.** Every span carries `observability.visibility = observed | inferred`. The system never claims it saw something it inferred.

---

## 4. The pipeline (services to instrument)

```
Customer taps "Receive Payment"
        │
        ▼
[web]                 merchant frontend (Next.js) — the phone screen
        │
        ▼
[payment-api]         accepts the charge, creates the settlement record
        │
        ▼
[mock-processor]      pretends to be Flutterwave/Paystack  ◄── OBSERVED BOUNDARY
        │                (returns synchronously, then fires an async webhook)
        │  ⋯ async webhook gap — trace context must survive this ⋯
        ▼
[settlement]          on webhook: restores context, runs FX + chain settle
        ├── fx.convert        (mock)
        ├── chain.settle      (REAL — viem → Celo Alfajores)  ◄── THE EXOTIC SUBTREE
        ├── balance.update    (DB)
        └── merchant.notify   (mock → phone flips to ✓)
```

Every service emits OTLP spans to SigNoz. `settlement` also emits metrics (durations, stall counter, delayed-value gauge).

---

## 5. The trace (semantic convention)

Root span `settlement.receive_payment` with children as below. Full attribute list in `ARCHITECTURE.md`. The intellectual work here — the reason this isn't a wrapper — is **defining what an on-chain-crossing payment trace should mean**.

```
settlement.receive_payment            merchant.id, settlement.id, amount.ngn
├── payment.create_record
├── payment.provider.charge           payment.provider, provider.ref        [observed]
│      ⋯ webhook gap ⋯
└── settlement.on_confirmation         (context restored via span link)
    ├── fx.convert                     fx.rate, amount.cusd
    ├── chain.settle
    │   ├── chain.estimate_gas         chain.gas_estimate
    │   ├── chain.read_nonce           chain.nonce
    │   ├── wallet.sign
    │   ├── rpc.send_transaction       tx.hash, rpc.provider, chain.id       [observed]
    │   └── chain.wait_for_receipt     tx.status, diagnosis.*                [observed→inferred]
    ├── balance.update
    └── merchant.notify
```

---

## 6. Deterministic diagnosis (no LLM)

A published rule table maps observed span signals to a named verdict with confidence and evidence. Same telemetry in → same verdict out. Populates `diagnosis.type`, `diagnosis.confidence`, `diagnosis.evidence` on the relevant span.

| Observed signal | Verdict | Confidence | Evidence | Visibility |
|---|---|---|---|---|
| send ok + no receipt after N blocks | `confirmation_timeout` | low | no mempool visibility from provider | inferred |
| estimate_gas returns revert data | `contract_revert_pre_broadcast` | high | revert reason string | observed |
| submitted nonce < pending account nonce | `stale_nonce` | high | getTransactionCount vs submitted nonce | observed |
| provider.charge ok + no webhook after T | `provider_stall` | medium | no visibility past processor boundary | inferred |

The demo line this earns: *"The verdict isn't a guess. It comes from a published rule, and each verdict shows the evidence that triggered it."*

---

## 7. The SigNoz-specific layer (this wins "Best Use of SigNoz")

The trace alone is a B+ on the named criterion. These push it to an A and kill the "why not any OTel backend?" question — Funnels is SigNoz-proprietary.

- **Tracing Funnels** — steps: `receive_payment → provider.charge → on_confirmation → chain.settle → balance.update → merchant.notify`. Shows conversion rate, drop-off point, and inter-step latency across many settlements. This is the fleet view.
- **Alerts** — (a) `chain.wait_for_receipt` p95 over threshold → "confirmation degradation"; (b) `provider.charge` error-rate spike; (c) business-framed: "N merchant settlements delayed in last 10 min."
- **Metrics panel** — per-provider p95 latency side by side; delayed-value gauge in NGN.
- **Logs** — structured logs correlated to the trace at each stage.

Protect these in the schedule. They are the easiest parts to cut for time and the most heavily scored.

---

## 8. Mapping to the six judging criteria

| # | Criterion | How Meridian scores | Where the points are won |
|---|---|---|---|
| 01 | Potential Impact | Real, growing category; frame as the **money problem** (support can't answer, merchants churn), not "tracing is useful" | Framing in README + demo |
| 02 | Creativity | Nothing on their 15-example list crosses into a chain; the fiat→chain crossing is the novelty | The crossing, kept concrete (not abstracted to "trust boundaries") |
| 03 | Technical Excellence | The webhook context-propagation gap is real distributed-tracing craft; clean repo | The context bridge done right |
| 04 | Best Use of SigNoz | Traces + Funnels + alerts + metrics + logs | The SigNoz layer (§7) — do not shortchange |
| 05 | User Experience | The trace *is* the interface; tap → one clear picture → obvious red span | Trace legibility, not custom UI |
| 06 | Presentation | The reveal-structured demo + a use-case-first README | Demo script (§ DEMO_SCRIPT.md) |

---

## 9. The wow (summary — full beats in DEMO_SCRIPT.md)

Not "here's a trace." The wow is **three identical-looking stalls pulled apart, on a clock, in money.**

1. **The lie everyone knows** — tap Receive Payment, spinner, "pending." Nobody knows if the money is coming, gone, or stolen. Feel the blindness before showing tech.
2. **Three identical stalls** — run it three times; the *same* spinner stalls all three. Open the three traces: three completely different red spans (processor / pre-broadcast revert / chain confirmation). Three failures pixel-identical to the merchant, told apart in two seconds. **This is the 84→25 moment.**
3. **The number that moves** — zoom to the Funnel; a live counter climbs 40→80→127 as injected RPC degradation bites; the alert fires. "The system noticed before a single complaint."

Two upgrades that separate "clever" from "leaning forward":
- **Money and time on screen**, not span durations: "₦2,000 stuck for 47 seconds" / "₦254,000 in settlements delayed."
- **End on recovery** — reroute to a healthy RPC provider; the merchant's phone (still on screen from beat 1) flips "pending" → "₦2,000 received ✓." The arc closes where it opened.

---

## 10. Non-goals / explicit cuts

- No real payment-processor integration.
- No multi-chain.
- No AI/LLM anywhere in the diagnosis path (MCP is at most a Q&A nicety, never the headline).
- No custom analytics UI that duplicates what SigNoz already shows — the trace and Funnel *are* the UI.
