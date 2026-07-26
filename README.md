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
- Uses **SigNoz Tracing Funnels, alerts, a metrics dashboard, logs correlated to traces, and the MCP server** to turn one trace into a fleet-level early-warning system.
- Ships a small companion app (landing page, a live payment demo, and a settlements dashboard) — a supporting artifact. **The SigNoz trace and Funnel are still the primary interface**; the app doesn't replace them.

## The problem it solves (in one sentence)
A company running fiat-to-crypto payments can, for the first time, see a stuck payment as one connected story and tell instantly which system failed.

## Why one trace matters
Three failures look **identical** to the merchant — same spinner, same "pending":
- the payment processor stalled,
- the transaction reverted before it ever broadcast,
- the chain is stuck on confirmation.

The trace tells them apart in two seconds. That contrast — identical stalls pulled apart by evidence, not guesswork — is the core of the demo.

---

## Architecture

### Service topology

Five app services + self-hosted SigNoz. All app services are Node/TypeScript. The frontend is Next.js 16. Only the chain leg touches a real network.

```
┌────────────┐   HTTP    ┌─────────────┐   HTTP    ┌──────────────────┐
│    web     │──────────▶│ payment-api │──────────▶│  mock-processor  │
│ (Next.js)  │           │  (Node)     │           │  (Node)          │
│ phone UI   │◀──────────│             │           │  returns 200 now │
└────────────┘  poll     └─────────────┘           │  + async webhook │
      ▲                        │                    └────────┬─────────┘
      │                        │ create settlement record     │ webhook (async,
      │ "received ✓"           ▼                              │ seconds later)
      │                  ┌──────────┐              ┌──────────▼─────────┐
      └──────────────────│ Postgres │◀─────────────│    settlement      │
                          │          │              │  fx → chain → db   │
                          └──────────┘              │  → notify          │
                                                     └─────────┬──────────┘
                                                               │ viem, via
                                                               │ rpc-proxy
                                                               ▼
                                                     ┌────────────────────┐
                                                     │   Celo Sepolia     │
                                                     │  (real testnet)    │
                                                     └────────────────────┘

  ALL services ──OTLP/HTTP──▶  SigNoz (self-hosted via Foundry: traces, funnels, alerts, metrics, logs, MCP)
```

`rpc-proxy` sits between `settlement` and the real Celo Sepolia RPC. Its normal job is transparent pass-through — its demo job is to inject *real* latency/failure into a real network path via a live `/control` endpoint, so failures are genuine conditions discovered by instrumentation, never hardcoded effects.

### Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind | landing, `/pay`, `/dashboard`, `/docs` |
| Services | Node + TypeScript, Express | `payment-api`, `mock-processor`, `settlement`, `rpc-proxy` |
| Instrumentation | `@opentelemetry/sdk-node`, OTLP/HTTP exporter | one shared `packages/otel` — semantic convention, context bridge, diagnosis rules |
| Chain | `viem`, Celo Sepolia testnet | the one real, un-fakeable leg |
| Contract | minimal Solidity settlement contract on Celo Sepolia | `require(amount > 0)` — genuinely revertible on demand |
| DB | Postgres | settlement records |
| Observability | **SigNoz**, self-hosted via **Foundry** | traces, Tracing Funnel, alerts, metrics dashboard, logs, MCP server |

### The span schema (semantic convention)

Defined once in `packages/otel/conventions.ts`, reused across every service:

```
settlement.receive_payment            merchant.id, settlement.id, amount.ngn
├── payment.create_record
├── payment.provider.charge           payment.provider, provider.ref        [observed]
│      ⋯ async webhook gap — context bridged via a persisted traceparent ⋯
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

### The hard part: trace context across an async webhook

`mock-processor` returns 200 immediately, then fires a **separate inbound HTTP request** (the webhook) to `settlement` seconds later. That webhook is a fresh request with no shared process state — trace context does not propagate automatically across it. Left alone, this produces two disconnected traces.

The fix (`packages/otel/context-bridge.ts`):
1. When `payment-api` calls the processor, **persist the W3C `traceparent`** on the settlement record.
2. When the webhook lands, **look up the record, extract the stored `traceparent`**, rebuild the parent context from it.
3. Start `settlement.on_confirmation` inside that restored context, with a **span link** back to `payment.provider.charge` — the causal relationship stays explicit even across the async boundary.

### Deterministic diagnosis (no LLM)

| Observed signal | Verdict | Confidence | Visibility | Evidence |
|---|---|---|---|---|
| send ok, no receipt after N blocks | `confirmation_timeout` | low | inferred | no mempool visibility from provider |
| `estimate_gas` returns revert data | `contract_revert_pre_broadcast` | high | observed | real revert reason string |
| submitted nonce < pending account nonce | `stale_nonce` | high | observed | `getTransactionCount` vs submitted nonce |
| provider accepted charge, no webhook after T | `provider_stall` | medium | inferred | no visibility past the processor boundary |

A published rule table maps observed span signals to a named verdict — same telemetry in, same verdict out, every time. No model, no summarization, no guessing.

### Failure injection — real causes, discovered effects

| Failure | Injected cause (real) | Discovered effect (instrumented) |
|---|---|---|
| RPC degradation | `rpc-proxy` delays/withholds real `eth_getTransactionReceipt` responses | `chain.wait_for_receipt` genuinely waits and times out |
| Pre-broadcast revert | call the contract with input that genuinely reverts | `chain.estimate_gas` returns real revert data; send never fires |
| Processor stall | `mock-processor` accepts the charge, genuinely never fires the webhook | `settlement.on_confirmation` never starts — the trace is dark past that boundary |
| Nonce race | two settlements genuinely race on the account nonce | `rpc.send_transaction` fails with a real "nonce too low" error |

None of these is a hardcoded sleep or a printed error string — the cause is real, the instrumentation discovers the effect.

### Metrics emitted by `settlement`

| Instrument | Type | Labels | Purpose |
|---|---|---|---|
| `settlement.stage.duration` | histogram | `stage`, `rpc.provider` | per-stage p95, per-provider comparison panel |
| `settlement.stalled` | counter | `stage` | the climbing stalled-count on the dashboard |
| `settlement.value_delayed_ngn` | up-down counter | — | the ₦ value-at-risk gauge |

### The SigNoz layer

- **Tracing Funnel** across all six pipeline steps — conversion rate and drop-off point across many settlements.
- **Alerts** — `chain.wait_for_receipt` p95 breach, provider error-rate spike, and a business-framed "settlements delayed" alert on the value-at-risk gauge.
- **Dashboard** — per-provider p95 latency, the value-delayed gauge, stalled-by-stage.
- **Logs** correlated to traces at every stage via SigNoz's trace-to-logs view.
- **MCP server** deployed alongside SigNoz via Foundry, wired into this repo's `.mcp.json`.

---

## Real bugs this instrumentation actually caught

Not hypothetical edge cases — things that were genuinely broken and only surfaced because the SigNoz layer was built out fully, not just "spans appear in the UI":

- **Logs were silently going nowhere.** `BatchLogRecordProcessor`'s constructor signature changed upstream — passed positionally instead of as an options object, it silently no-ops instead of throwing. Every log line was generated and dropped, for weeks, with zero errors. Only caught by querying ClickHouse directly for a row with a known trace ID and finding none.
- **A "per-provider" dashboard panel wasn't grouping by provider at all.** SigNoz's PromQL layer doesn't auto-alias dotted attribute names (`rpc.provider`) to underscores (`rpc_provider`) — the group-by silently matched nothing and collapsed to one series. Fixed by quoting the literal key: `by ("rpc.provider")`.
- **A frontend bug only visible by actually using the app.** The status poller didn't know about a `"processing"` status added in a later phase, so it declared failure the instant a webhook arrived — often seconds before the real chain settlement even finished. Digging into it surfaced a second, worse bug: an unhandled `sendTransaction` exception under concurrent settlements (a real nonce race) that permanently orphaned settlements with no verdict ever recorded. Fixed by wrapping the send and routing the failure to the `stale_nonce` verdict that already existed in the diagnosis table but had no reachable code path.

Full write-up (with the actual error messages and fixes): see the [project blog](https://medium.com/@divinenation1/i-built-a-distributed-trace-that-crosses-into-a-blockchain-1b9cb1173408) and `log.md`.

---

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
Open `http://localhost:3000` — landing page → `/pay` to trigger a real settlement → `/dashboard` to watch it live → `/docs` for the condensed technical reference → open the trace in SigNoz directly from either page.

## Docs
- [`PRD.md`](PRD.md) — product + strategy
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — full topology, span schema, the webhook context bridge
- [`BUILD_PHASES.md`](BUILD_PHASES.md) — phased build + checklists
- [`SIGNOZ_LAYER.md`](SIGNOZ_LAYER.md) — funnels, alerts, metrics, queries
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — the recorded walkthrough, beat by beat
- `/docs` in the running app — the same reference, live

## Honesty
Meridian sees up to the point a transaction is sent and a receipt returns; it does not see the mempool, and it does not see inside the third-party processor. Where visibility ends, it infers — and marks every inference as such, with a confidence level and the evidence behind it.
