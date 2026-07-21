/**
 * Meridian — payment-api (Phase 1).
 *
 * POST /pay: creates the settlement record, calls mock-processor synchronously
 * (payment.provider.charge, the observed boundary), and returns immediately.
 * The traceparent captured during payment.provider.charge is what the async
 * webhook (received by `settlement`) later restores — see packages/otel/context-bridge.ts.
 */
import { startTracing } from "../../packages/otel/tracing";
startTracing("payment-api");

import express from "express";
import cors from "cors";
import { trace } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { captureTraceparent } from "../../packages/otel/context-bridge";
import { SPAN, ATTR } from "../../packages/otel/conventions";
import { createSettlement, setTraceparent, getSettlement } from "../../packages/db/settlements";

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
      });

      res.json({ ok: true, settlementId });
    } finally {
      root.end();
    }
  });
});

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
