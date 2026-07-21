/**
 * Meridian — mock-processor (Phase 1).
 *
 * Accepts a charge and returns 200 immediately, then — after a delay, and
 * outside any request's trace context — fires the confirmation webhook to
 * `settlement`. The webhook is deliberately run under ROOT_CONTEXT so it does
 * NOT inherit the /charge request's span: Node's AsyncLocalStorage would
 * otherwise happily carry it across the setTimeout, which would silently
 * fake the very gap the context bridge (packages/otel/context-bridge.ts) is
 * supposed to fix. This is why the webhook is a fresh, contextless request —
 * same as a real payment provider's callback would be.
 *
 * Context on /charge is extracted explicitly (propagation.extract), not left
 * to http auto-instrumentation: verified by direct test that this version
 * combo creates a span for the incoming request but does NOT apply the
 * extracted parent context to it (trace.getSpanContext(context.active()) was
 * undefined even with a valid incoming traceparent header). Same explicit
 * philosophy as the async bridge, applied to the sync hop.
 *
 * STALL_MODE=true accepts the charge but never sends the webhook, injecting
 * the real provider_stall failure (Phase 3), not a hardcoded effect.
 */
import "dotenv/config";
import { startTracing } from "../../packages/otel/tracing";
startTracing("mock-processor");

import express from "express";
import { context, propagation, trace, ROOT_CONTEXT, SpanKind } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";

const tracer = trace.getTracer("meridian-mock-processor");

const SETTLEMENT_WEBHOOK =
  process.env.SETTLEMENT_WEBHOOK ?? "http://localhost:4002/webhook/confirmed";
const STALL_MODE = process.env.STALL_MODE === "true";
const WEBHOOK_DELAY_MS = Number(process.env.WEBHOOK_DELAY_MS ?? 3000);

const app = express();
app.use(express.json());

app.post("/charge", (req, res) => {
  const parentCtx = propagation.extract(context.active(), req.headers);

  context.with(parentCtx, () => {
    const span = tracer.startSpan(
      "payment.provider.charge.receive",
      { kind: SpanKind.SERVER },
      parentCtx,
    );

    context.with(trace.setSpan(parentCtx, span), () => {
      const { settlementId, merchantId, amountNgn } = req.body;
      const providerRef = `flw_ref_${randomUUID().slice(0, 8)}`;

      res.json({ ok: true, providerRef, status: "accepted" });
      span.end();

      if (STALL_MODE) {
        console.log(`STALL_MODE: withholding webhook for ${settlementId}`);
        return;
      }

      setTimeout(() => {
        context.with(ROOT_CONTEXT, () => {
          fetch(SETTLEMENT_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settlementId, merchantId, amountNgn, providerRef }),
          }).catch((err) => console.error("webhook delivery failed", err));
        });
      }, WEBHOOK_DELAY_MS);
    });
  });
});

const PORT = 4001;
app.listen(PORT, () => console.log(`mock-processor listening on :${PORT}`));
