# MERIDIAN — Architecture

## 1. Service topology

Five app services + SigNoz. All app services are Node/TypeScript. The `web` frontend is Next.js 16.2 (webpack, **not** Turbopack). Only the chain leg touches a real network.

```
┌────────────┐   HTTP    ┌─────────────┐   HTTP    ┌──────────────────┐
│    web     │──────────▶│ payment-api │──────────▶│  mock-processor  │
│ (Next.js)  │           │  (Node)     │           │  (Node)          │
│ phone UI   │◀──────────│             │           │  returns 200 now │
└────────────┘  poll/SSE └─────────────┘           │  + async webhook │
      ▲                        │                    └────────┬─────────┘
      │                        │ create settlement record     │ webhook (async)
      │ "received ✓"           ▼                              ▼
      │                  ┌──────────┐              ┌────────────────────┐
      └──────────────────│ Postgres │◀─────────────│    settlement      │
                         │ (Supabase│              │    (Node)          │
                         │  or local)│             │  fx → chain → db   │
                         └──────────┘              │  → notify          │
                                                   └─────────┬──────────┘
                                                             │ viem
                                                             ▼
                                                   ┌────────────────────┐
                                                   │  Celo Sepolia     │
                                                   │  (real testnet)     │
                                                   │  via RPC provider   │
                                                   └────────────────────┘

  ALL services ──OTLP/HTTP──▶  SigNoz (self-hosted, docker-compose)
```

The **RPC provider** is a thin proxy you control so you can inject latency/failure into a *real* network path (see §5). This keeps the chain leg genuinely real while letting failures be injected as real conditions, not hardcoded.

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16.2, TypeScript, Tailwind | run with `--webpack`, never Turbopack |
| Services | Node 20 + TypeScript, Express or Fastify | 4 small services |
| Instrumentation | `@opentelemetry/sdk-node`, OTLP HTTP exporter | one shared `packages/otel` |
| Chain | `viem`, Celo Sepolia testnet | the only real network leg |
| Contract | a minimal Solidity settlement contract on Celo Sepolia | one that can be made to revert on demand |
| DB | Postgres (Supabase or local container) | settlement records, balances |
| Observability | SigNoz self-hosted via docker-compose | traces + metrics + logs + Funnels + alerts |

## 3. The span schema (semantic convention)

This is the intellectual core. Define it once in `packages/otel/conventions.ts` and reuse across every service so the trace is coherent.

### Root: `settlement.receive_payment`
| Attribute | Example | Notes |
|---|---|---|
| `merchant.id` | `mrc_lagos_014` | |
| `settlement.id` | `stl_9af3…` | correlation id, persisted on the payment record |
| `amount.ngn` | `2000` | the money figure the demo surfaces |
| `amount.currency` | `NGN` | |

### `payment.provider.charge`  *(observed boundary)*
| Attribute | Example |
|---|---|
| `payment.provider` | `mock-flutterwave` |
| `payment.provider.ref` | `flw_ref_…` |
| `payment.status` | `accepted` |
| `observability.visibility` | `observed` |

### `settlement.on_confirmation`
Restored from persisted trace context; carries a **span link** back to `payment.provider.charge` (see §4).

### `fx.convert`
`fx.rate`, `amount.cusd`.

### `chain.settle` → children
| Span | Key attributes |
|---|---|
| `chain.estimate_gas` | `chain.gas_estimate`; on revert: `diagnosis.*` |
| `chain.read_nonce` | `chain.nonce` |
| `wallet.sign` | — |
| `rpc.send_transaction` | `tx.hash`, `rpc.provider`, `chain.id=11142220`, `contract.address`, `contract.function` |
| `chain.wait_for_receipt` | `tx.status`, `tx.confirmations`, `diagnosis.type`, `diagnosis.confidence`, `diagnosis.evidence`, `observability.visibility` |

### `balance.update`, `merchant.notify`
DB write; mock push that flips the phone to ✓.

### Diagnosis attributes (populated by the deterministic classifier)
| Attribute | Values |
|---|---|
| `diagnosis.type` | `confirmation_timeout` \| `contract_revert_pre_broadcast` \| `stale_nonce` \| `provider_stall` \| `none` |
| `diagnosis.confidence` | `high` \| `medium` \| `low` |
| `diagnosis.evidence` | free-text evidence string |
| `observability.visibility` | `observed` \| `inferred` |

## 4. The hard part: trace context across the async webhook gap

**Why it's hard.** `mock-processor` returns 200 immediately, then fires a *separate* inbound HTTP request (the webhook) to `settlement` some seconds later. That webhook is a fresh request — trace context does **not** propagate automatically. If you do nothing, SigNoz shows *two disconnected traces* and your whole "one trace" thesis breaks.

**The fix (three steps):**
1. When `payment-api` calls the processor, **persist the W3C `traceparent`** onto the settlement record (a column), alongside `settlement.id`.
2. When the webhook lands at `settlement`, **look up the record, extract the stored `traceparent`**, and build a parent context from it.
3. Start `settlement.on_confirmation` **inside that restored context**, and add a **span link** back to the original `payment.provider.charge` span so the causal relationship is explicit even though it crossed an async boundary.

Reference implementation: `packages/otel/context-bridge.ts`.

**Fallback if it fights you (documented so you're not stuck at 2am):** make the confirmation step *synchronous* — `settlement` polls the processor mock instead of receiving a webhook — which keeps context in-process and the trace whole. Uglier, less impressive, but ships. Only fall back if the async bridge eats more than ~half a day.

## 5. Failure injection (real causes, discovered effects)

The RPC provider is a **proxy service you own** sitting between `settlement` and the real Celo Sepolia RPC. Its normal job is pass-through. Its demo job is to inject *real* conditions:

| Failure | Injected cause (real) | Discovered effect (instrumented) | Verdict |
|---|---|---|---|
| RPC degradation | proxy delays/timeouts real `eth_getTransactionReceipt` calls | `chain.wait_for_receipt` genuinely waits and times out | `confirmation_timeout` |
| Pre-broadcast revert | call the settlement contract with input that genuinely reverts | `chain.estimate_gas` returns real revert data; send never fires | `contract_revert_pre_broadcast` |
| Processor stall | `mock-processor` accepts then genuinely never fires the webhook | `settlement.on_confirmation` never starts; trace dark at the boundary | `provider_stall` |

None of these is a hardcoded sleep or a printed error. The cause is real; the instrumentation finds the effect. This is the rule from PRD §3.2 — bake it into the mocks from the first line.

## 6. Metrics (emitted by `settlement`)

| Instrument | Type | Labels | Purpose |
|---|---|---|---|
| `settlement.stage.duration` | histogram | `stage`, `rpc.provider` | per-stage p95, per-provider comparison panel |
| `settlement.stalled` | counter | `stage` | the climbing number in demo beat 3 |
| `settlement.value_delayed_ngn` | up-down counter / gauge | — | the "₦254,000 delayed" figure |

## 7. Data flow for `settlement.id` (the correlation key)

`settlement.id` is generated at `payment-api`, written to the DB, passed to the processor, echoed in the webhook, and used to reload the persisted `traceparent`. It is the thread that ties fiat and chain into one story. Every structured log line includes it.
