# Meridian

**One trace, every rail.** Follow a single payment from a fiat rail to final on-chain settlement — as one distributed trace, in SigNoz.

When a fiat-to-crypto payment stalls, support gets *"where's my money?"* and can't answer it. The payment crossed a processor, a backend, an FX step, a wallet, an RPC provider, and a blockchain — each with separate logs, or none. Meridian stitches all of it into **one trace per payment**, so a stuck payment becomes a two-second answer instead of a five-dashboard guess.

Built for **Agents of SigNoz** (SigNoz × WeMakeDevs). Track 02 — Signals & Dashboards.

---

## What it does
- Instruments a fiat→crypto settlement pipeline end-to-end with **OpenTelemetry**.
- Emits **one distributed trace** per payment into self-hosted **SigNoz**, crossing the fiat/blockchain boundary — a span sequence no observability demo has shown.
- Names failures with a **deterministic diagnosis engine** (no LLM): same telemetry in, same verdict out, evidence attached.
- Distinguishes **observed vs inferred** on every verdict — it never claims to have seen what it inferred.
- Uses **SigNoz Tracing Funnels, alerts, and metrics** to turn one trace into a fleet-level early-warning system.

## The problem it solves (in one sentence)
A company running fiat-to-crypto payments can, for the first time, see a stuck payment as one connected story and tell instantly which system failed.

## Why one trace matters
Three failures look **identical** to the merchant — same spinner, same "pending":
- the payment processor stalled,
- the transaction reverted before it ever broadcast,
- the chain is stuck on confirmation.

The trace tells them apart in two seconds. That contrast — three identical stalls pulled apart — is the core of the demo.

## Architecture (short)
```
Customer → payment-api → mock-processor ─(async webhook)→ settlement
                                                            ├── fx.convert
                                                            ├── chain.settle   (REAL: viem → Celo Alfajores)
                                                            ├── balance.update
                                                            └── merchant.notify
   every service → OTLP → SigNoz (traces + funnels + alerts + metrics + logs)
```
The blockchain leg is real (real tx hash on Alfajores). Everything else is a mock we own. Failures are injected as **real conditions** and discovered by the instrumentation — never hardcoded. Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it
1. Bring up SigNoz: `git clone https://github.com/SigNoz/signoz && cd signoz/deploy/docker && docker compose up -d` (UI at `:8080`, OTLP at `:4318`).
2. From `infra/`: `docker compose up` (Postgres, RPC proxy, the three services).
3. Run the merchant UI: `cd web && next dev --webpack`.
4. Open SigNoz Traces and tap "Receive Payment."

## Docs
- [`docs/PRD.md`](docs/PRD.md) — product + strategy
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — topology, span schema, the webhook context bridge
- [`docs/BUILD_PHASES.md`](docs/BUILD_PHASES.md) — phased build + checklists
- [`docs/SIGNOZ_LAYER.md`](docs/SIGNOZ_LAYER.md) — funnels, alerts, metrics, queries
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — the 90-second reveal
- [`docs/AGENT_PROMPT.md`](docs/AGENT_PROMPT.md) — prompt for the coding agent
- [`docs/handoff.md`](docs/handoff.md) / [`docs/log.md`](docs/log.md) — session discipline

## Honesty
Meridian sees up to the point a transaction is sent and a receipt returns; it does not see the mempool, and it does not see inside the third-party processor. Where visibility ends, it infers — and marks every inference as such, with a confidence level and the evidence behind it.
