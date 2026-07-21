/**
 * Meridian — trace-context bridge across the async webhook gap.
 *
 * THE PROBLEM: mock-processor returns 200 immediately, then fires a SEPARATE
 * inbound webhook to `settlement` seconds later. That webhook is a fresh HTTP
 * request — W3C context does NOT propagate automatically. Do nothing and SigNoz
 * shows TWO disconnected traces, breaking the entire "one trace" thesis.
 *
 * THE FIX:
 *   1. At charge time, serialize the active context to a W3C traceparent string
 *      and persist it on the settlement record (see saveTraceparent usage).
 *   2. When the webhook lands, load the record, rebuild a parent context from the
 *      stored traceparent, and start `settlement.on_confirmation` INSIDE it.
 *   3. Add a span LINK back to the original charge span so the causal edge is
 *      explicit across the async boundary.
 *
 * If this fights you for more than ~half a day, take the documented fallback:
 * make confirmation synchronous (settlement polls the processor mock), keeping
 * context in-process. Uglier, but the trace stays whole. (ARCHITECTURE §4)
 */
import {
  context,
  propagation,
  trace,
  SpanKind,
  Span,
  Context,
} from "@opentelemetry/api";

const tracer = trace.getTracer("meridian-settlement");

/** Step 1 — call at charge time to get the traceparent to persist. */
export function captureTraceparent(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier; // { traceparent: "00-<traceid>-<spanid>-01", ... }
}

/**
 * Step 2+3 — call when the webhook lands. Rebuilds the parent context from the
 * persisted carrier and runs `fn` inside a linked `on_confirmation` span.
 */
export function resumeInWebhook<T>(
  persistedCarrier: Record<string, string>,
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  // Rebuild the parent context from what we stored at charge time.
  const parentCtx: Context = propagation.extract(context.active(), persistedCarrier);

  // Link back to the original charge span for an explicit causal edge.
  const parentSpanCtx = trace.getSpanContext(parentCtx);
  const links = parentSpanCtx ? [{ context: parentSpanCtx }] : [];

  return context.with(parentCtx, () => {
    const span = tracer.startSpan(
      spanName,
      { kind: SpanKind.CONSUMER, links },
      parentCtx,
    );
    return context.with(trace.setSpan(parentCtx, span), async () => {
      try {
        return await fn(span);
      } finally {
        span.end();
      }
    });
  });
}

/**
 * Verification helper for Phase 1: log the trace id at charge and at webhook.
 * They MUST match. If they don't, the bridge is broken — do not proceed.
 */
export function currentTraceId(): string | undefined {
  return trace.getSpanContext(context.active())?.traceId;
}
