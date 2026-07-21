/**
 * Meridian — payment-api (Phase 3: provider_stall watchdog added).
 *
 * POST /pay: creates the settlement record, calls mock-processor synchronously
 * (payment.provider.charge, the observed boundary), and returns immediately.
 * The traceparent captured during payment.provider.charge is what the async
 * webhook (received by `settlement`) later restores — see packages/otel/context-bridge.ts.
 *
 * provider_stall watchdog: settlement's /webhook/confirmed handler never runs
 * at all if mock-processor withholds the webhook (STALL_MODE) — there's no
 * incoming request to react to. payment-api is the only service that knows it
 * charged and is waiting, so it schedules a real check: after
 * WEBHOOK_THRESHOLD_MS, re-read the settlement's actual DB status. If still
 * "pending", the webhook genuinely never arrived — declare provider_stall,
 * discovered by checking real state, not assumed. Reuses resumeInWebhook to
 * land the diagnosis span on the SAME trace as the charge, exactly like the
 * success path does — one connected trace regardless of outcome.
 */
import "dotenv/config";
import { startTracing } from "../../packages/otel/tracing";
startTracing("payment-api");

import express from "express";
import cors from "cors";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { captureTraceparent, resumeInWebhook } from "../../packages/otel/context-bridge";
import {
  SPAN,
  ATTR,
  classify,
  BLOCK_THRESHOLD,
  WEBHOOK_THRESHOLD_MS,
} from "../../packages/otel/conventions";
import { createSettlement, setTraceparent, getSettlement, updateSettlementStatus } from "../../packages/db/settlements";

const tracer = trace.getTracer("meridian-payment-api");
const PROCESSOR_URL = process.env.PROCESSOR_URL ?? "http://localhost:4001";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/pay", async (req, res) => {
  const settlementId = `stl_${randomUUID().slice(0, 8)}`;
  const merchantId = req.body?.merchantId ?? "mrc_lagos_014";
  const amountNgn = Number(req.body?.amountNgn ?? 2000);

  await tracer.startActiveSpan(SPAN.RECEIVE_PAYMENT, async (root) => {
    root.setAttributes({
      [ATTR.SETTLEMENT_ID]: settlementId,
      [ATTR.MERCHANT_ID]: merchantId,
      [ATTR.AMOUNT_NGN]: amountNgn,
      [ATTR.AMOUNT_CURRENCY]: "NGN",
    });

    try {
      await tracer.startActiveSpan(SPAN.CREATE_RECORD, async (span) => {
        await createSettlement({ id: settlementId, merchantId, amountNgn });
        span.end();
      });

      await tracer.startActiveSpan(SPAN.PROVIDER_CHARGE, async (span) => {
        // Persist the traceparent for THIS span — the webhook links back to it.
        const traceparent = captureTraceparent().traceparent;
        await setTraceparent(settlementId, traceparent);

        // NOTE: do not manually inject a traceparent header here — the
        // instrumentation-undici auto-instrumentation already injects one for
        // this outgoing fetch call. Doing both produces a single header with
        // two comma-joined values, which fails strict W3C traceparent parsing
        // on the receiving end (verified: this exact double-injection bug
        // silently broke context extraction in mock-processor).
        const resp = await fetch(`${PROCESSOR_URL}/charge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settlementId, merchantId, amountNgn }),
        });
        const data = (await resp.json()) as { providerRef: string };

        span.setAttributes({
          [ATTR.PAYMENT_PROVIDER]: "mock-flutterwave",
          [ATTR.PROVIDER_REF]: data.providerRef,
          [ATTR.PAYMENT_STATUS]: "accepted",
          [ATTR.VISIBILITY]: "observed",
        });
        span.end();

        scheduleStallWatchdog(settlementId, merchantId, amountNgn, traceparent);
      });

      res.json({ ok: true, settlementId });
    } finally {
      root.end();
    }
  });
});

function scheduleStallWatchdog(
  settlementId: string,
  merchantId: string,
  amountNgn: number,
  traceparent: string,
) {
  setTimeout(async () => {
    const rec = await getSettlement(settlementId);
    // "pending" = webhook never arrived at all. "processing" = it DID arrive
    // and settlement is genuinely still working (e.g. a slow real RPC call) —
    // that is NOT a stall and must not be misdiagnosed as one (found via
    // testing: without this distinction, a merely-slow chain call produced a
    // false-positive provider_stall).
    if (!rec || rec.status !== "pending") return;

    await resumeInWebhook({ traceparent }, SPAN.ON_CONFIRMATION, async (span) => {
      span.setAttributes({
        [ATTR.SETTLEMENT_ID]: settlementId,
        [ATTR.MERCHANT_ID]: merchantId,
        [ATTR.AMOUNT_NGN]: amountNgn,
      });

      const verdict = classify({
        sendSucceeded: false,
        receiptAfterBlocks: null,
        blockThreshold: BLOCK_THRESHOLD,
        gasEstimateRevertReason: null,
        providerAccepted: true,
        webhookAfterMs: null, // genuinely never arrived by the time we checked
        webhookThresholdMs: WEBHOOK_THRESHOLD_MS,
      });

      span.setAttributes({
        [ATTR.DIAGNOSIS_TYPE]: verdict.type,
        [ATTR.DIAGNOSIS_CONFIDENCE]: verdict.confidence,
        [ATTR.DIAGNOSIS_EVIDENCE]: verdict.evidence,
        [ATTR.VISIBILITY]: verdict.visibility,
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: verdict.type });

      await updateSettlementStatus(settlementId, verdict.type);
    });
  }, WEBHOOK_THRESHOLD_MS + 500);
}

app.get("/status/:id", async (req, res) => {
  const rec = await getSettlement(req.params.id);
  if (!rec) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ settlementId: rec.id, status: rec.status });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`payment-api listening on :${PORT}`));
