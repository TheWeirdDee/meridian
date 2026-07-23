# Meridian

**One trace, every rail.** Follow a single payment from a fiat rail to final on-chain settlement — as one distributed trace, in SigNoz.

When a fiat-to-crypto payment stalls, support gets *"where's my money?"* and can't answer it. The payment crossed a processor, a backend, an FX step, a wallet, an RPC provider, and a blockchain — each with separate logs, or none. Meridian stitches all of it into **one trace per payment**, so a stuck payment becomes a two-second answer instead of a five-dashboard guess.

Built for **Agents of SigNoz** (SigNoz × WeMakeDevs). **Track 02 — Signals & Dashboards** (also defensible under Track 03 — Build Your Own).

> **AI-assistance disclosure:** this project was built with Claude Code (Anthropic) as a coding assistant throughout development — architecture, instrumentation, bug fixes, and the frontend were all done in collaboration with it. Declared per the hackathon rules.

---

## What it does
- Instruments a fiat→crypto settlement pipeline end-to-end with **OpenTelemetry**.
- Emits **one distributed trace** per payment into self-hosted **SigNoz**, crossing the fiat/blockchain boundary — a span sequence no observability demo has shown.
- Names failures with a **deterministic diagnosis engine** (no LLM): same telemetry in, same verdict out, evidence attached.
- Distinguishes **observed vs inferred** on every verdict — it never claims to have seen what it inferred.
- Uses **SigNoz Tracing Funnels, alerts, metrics, and the MCP server** to turn one trace into a fleet-level early-warning system.
- Ships a small companion app (landing page, a live payment demo, and a settlements dashboard) — a supporting artifact. **The SigNoz trace and Funnel are still the primary interface**; the app doesn't replace them.

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
                                                            ├── chain.settle   (REAL: viem → Celo Sepolia)
                                                            ├── balance.update
                                                            └── merchant.notify
   every service → OTLP → SigNoz (traces + funnels + alerts + metrics + logs)
```
The blockchain leg is real (real tx hash on Celo Sepolia). Everything else is a mock we own. Failures are injected as **real conditions** and discovered by the instrumentation — never hardcoded. Full detail in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Run it

**1. Bring up SigNoz via Foundry** (reproducible — see `casting.yaml` / `casting.yaml.lock`):
```bash
curl -fsSL https://signoz.io/foundry.sh | bash
foundryctl cast -f casting.yaml
```
This brings up SigNoz (`:8080`, OTLP on `:4318`) and the **SigNoz MCP server** (`:8000`) in one step. Judges can re-run Foundry against the committed `casting.yaml.lock` to reproduce this exact deployment.

**2. Bring up Postgres + the app services:**
```bash
docker run -d --name meridian-postgres -e POSTGRES_PASSWORD=meridian -e POSTGRES_DB=meridian -p 5432:5432 postgres:16
npm install
npm run dev:payment-api
npm run dev:mock-processor
npm run dev:settlement
npm run dev:rpc-proxy
```

**3. Run the app:**
```bash
npm run dev
```
Open `http://localhost:3000` — landing page → `/pay` to trigger a real settlement → `/dashboard` to watch it live → open the trace in SigNoz directly from either page.

## Docs
- [`PRD.md`](PRD.md) — product + strategy
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — topology, span schema, the webhook context bridge
- [`BUILD_PHASES.md`](BUILD_PHASES.md) — phased build + checklists
- [`SIGNOZ_LAYER.md`](SIGNOZ_LAYER.md) — funnels, alerts, metrics, queries
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — the 90-second reveal

## Honesty
Meridian sees up to the point a transaction is sent and a receipt returns; it does not see the mempool, and it does not see inside the third-party processor. Where visibility ends, it infers — and marks every inference as such, with a confidence level and the evidence behind it.
