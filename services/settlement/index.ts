/**
 * Meridian — settlement (Phase 1: mock confirmation only, no chain yet).
 *
 * The chain leg (chain.settle subtree, real viem/Alfajores) is Phase 2 — see
 * settle.ts, the parked reference implementation this file will grow into.
 * Phase 1's only job: prove the webhook resumes the SAME trace as the charge.
 *
 * Import order matters: startTracing() must run before express/anything else.
 */
import { startTracing } from "../../packages/otel/tracing";
startTracing("settlement");

import express from "express";
import { trace } from "@opentelemetry/api";
import { resumeInWebhook, currentTraceId } from "../../packages/otel/context-bridge";
import { SPAN, ATTR } from "../../packages/otel/conventions";
import { getSettlement, updateSettlementStatus } from "../../packages/db/settlements";

const tracer = trace.getTracer("meridian-settlement");

const app = express();
app.use(express.json());

app.post("/webhook/confirmed", async (req, res) => {
  const { settlementId, providerRef } = req.body;

  const record = await getSettlement(settlementId);
  if (!record || !record.traceparent) {
    res.status(404).json({ error: "unknown settlement or missing traceparent" });
    return;
  }

  await resumeInWebhook({ traceparent: record.traceparent }, SPAN.ON_CONFIRMATION, async (root) => {
    root.setAttributes({
      [ATTR.SETTLEMENT_ID]: settlementId,
      [ATTR.MERCHANT_ID]: record.merchantId,
      [ATTR.AMOUNT_NGN]: Number(record.amountNgn),
    });

    // Phase 1 verification: this traceId must equal the one logged at charge time.
    console.log("resumed trace", currentTraceId(), "for", settlementId);

    await tracer.startActiveSpan(SPAN.FX_CONVERT, async (span) => {
      const rate = 0.00065; // mock NGN -> cUSD
      const amountCusd = Number(record.amountNgn) * rate;
      span.setAttributes({ [ATTR.FX_RATE]: rate, [ATTR.AMOUNT_CUSD]: amountCusd });
      span.end();
    });

    await tracer.startActiveSpan(SPAN.BALANCE_UPDATE, async (span) => {
      await updateSettlementStatus(settlementId, "confirmed", providerRef);
      span.end();
    });

    await tracer.startActiveSpan(SPAN.MERCHANT_NOTIFY, async (span) => {
      // Mock push. The web UI observes this via GET /status polling and flips to "received ✓".
      span.end();
    });
  });

  res.json({ ok: true });
});

const PORT = 4002;
app.listen(PORT, () => console.log(`settlement listening on :${PORT}`));
