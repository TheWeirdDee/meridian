# MERIDIAN — SigNoz Layer

This is the "Best Use of SigNoz" criterion made concrete. The trace alone is not enough; these are the SigNoz-proprietary and SigNoz-deep features that a generic OTLP backend can't replicate.

## 1. Self-host

Use the docker-compose in `infra/`. SigNoz self-host is free and open source; the app services export OTLP/HTTP to the local collector. Confirm the region/endpoint isn't needed for self-host (self-host uses your local `/otlp` or collector endpoint, not the Cloud `mcp.<region>.signoz.cloud` URLs — those are for Cloud).

Endpoint for app services: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (HTTP) or the collector service name inside the compose network.

Optional but strong for Q&A: install the **SigNoz agent-skills / MCP** (github.com/SigNoz/agent-skills) so you can query traces conversationally during Q&A — *as a navigation aid only, never as the diagnosis path.*

## 2. Tracing Funnels (the proprietary hook)

SigNoz Tracing Funnels measure how requests progress through sequential spans within a trace — drop-off, error %, inter-step latency. No other observability platform offers this, per SigNoz's own material. Most competitors won't use it. You will.

**Funnel definition — "Settlement Funnel":**
1. `settlement.receive_payment` (root)
2. `payment.provider.charge`
3. `settlement.on_confirmation`
4. `chain.settle`
5. `balance.update`
6. `merchant.notify`

Reads to pull for the demo:
- Conversion rate step 4→5 (where chain stalls drop payments out).
- Error % at step 2 (processor stalls).
- Avg latency step 3→4 and 4→5 (the confirmation wait).

This produces beat 3's "127 stalled at the chain step" directly.

## 3. Alerts

| Alert | Condition | Demo role |
|---|---|---|
| Confirmation degradation | p95 of `chain.wait_for_receipt` duration > threshold over 5 min | fires in beat 3 |
| Processor error spike | error rate of `payment.provider.charge` > baseline | supports the provider-stall story |
| Settlements delayed (business) | count of settlements with a stalled stage in last 10 min > N | the human-legible alert |

Frame at least one alert in **business terms** ("settlements delayed"), not just span metrics — that's what makes a non-technical judge feel it.

## 4. Metrics panels

- **Per-provider p95 latency** (bar/line): `settlement.stage.duration` histogram, grouped by `rpc.provider`. Alchemy vs public RPC vs the injected-slow proxy, side by side. This is data that doesn't exist for real dApps today.
- **Value delayed (NGN)**: `settlement.value_delayed_ngn` gauge — the ₦254,000 figure.
- **Stall counter by stage**: `settlement.stalled` counter grouped by `stage`.

## 5. Query Builder examples (Track 02 credibility)

Show mastery by building these in the Query Builder (screenshot them for the README):
- Traces where `diagnosis.type = confirmation_timeout`, grouped by `rpc.provider`.
- p95 `chain.wait_for_receipt` duration by `rpc.provider` over time.
- Count of spans where `observability.visibility = inferred` (how often you're inferring vs observing).
- Failed settlements by `diagnosis.type` — the distribution of failure kinds.

## 6. Logs

Emit structured logs at each stage including `settlement.id` and `trace_id` so logs correlate to the trace in SigNoz's trace-to-logs view. On a failure, the log line carries the same `diagnosis.type` as the span.

## 7. Dashboard bundle

One saved SigNoz dashboard combining: the Settlement Funnel, the per-provider p95 panel, the value-delayed gauge, the failure-distribution panel, and links to the three canonical failing traces. This is what you screenshot for the README and open in beat 3.
