/**
 * Meridian — payment-api (Phase 0).
 *
 * Phase 0 scope only: one endpoint, one span, nothing downstream. No DB, no
 * processor call, no webhook. Proves the OTLP pipe reaches SigNoz.
 */
import { startTracing } from "../../packages/otel/tracing";
startTracing("payment-api");

import express from "express";
import { trace } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";

const tracer = trace.getTracer("meridian-payment-api");

const app = express();
app.use(express.json());

app.post("/pay", (req, res) => {
  const settlementId = `stl_${randomUUID().slice(0, 8)}`;
  const amountNgn = Number(req.body?.amountNgn ?? 2000);

  tracer.startActiveSpan("payment.received", (span) => {
    span.setAttributes({
      "settlement.id": settlementId,
      "amount.ngn": amountNgn,
      "amount.currency": "NGN",
    });
    span.end();
    res.json({ ok: true, settlementId });
  });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`payment-api listening on :${PORT}`));
