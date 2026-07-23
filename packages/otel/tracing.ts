/**
 * Meridian — shared OpenTelemetry bootstrap.
 * Import this ONCE at the very top of each service's entrypoint, before any
 * other imports that you want auto-instrumented:
 *
 *   import { startTracing } from "../packages/otel/tracing";
 *   startTracing("settlement");
 *
 * Exports OTLP/HTTP to self-hosted SigNoz (default http://localhost:4318).
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { logs } from "@opentelemetry/api-logs";

const OTLP = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

let sdk: NodeSDK | undefined;

export function startTracing(serviceName: string): void {
  if (sdk) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      "service.namespace": "meridian",
    }),
    traceExporter: new OTLPTraceExporter({ url: `${OTLP}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${OTLP}/v1/metrics` }),
      exportIntervalMillis: 5_000,
    }),
    // Logs emitted inside an active span (via getLogger(serviceName)) are
    // auto-correlated to the trace/span id by the SDK — that's what makes
    // "logs correlated to traces at each stage" (BUILD_PHASES Phase 4) work.
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${OTLP}/v1/logs` }) }),
    ],
    // Auto-instruments HTTP. Verified in Phase 1 that outgoing fetch/undici
    // calls correctly auto-inject traceparent — do NOT also inject manually,
    // that produces a header with two comma-joined values which fails strict
    // W3C parsing on the receiving end. But incoming express/http requests do
    // NOT get the extracted parent context applied automatically in this
    // combo, so every server needing that context extracts it explicitly
    // (see services/mock-processor's /charge handler, and the async webhook
    // case in context-bridge.ts, which was always explicit by design).
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on("SIGTERM", () => {
    sdk?.shutdown().finally(() => process.exit(0));
  });
}

/** Emits a log correlated to whatever span is active when called. */
export function getLogger(serviceName: string) {
  return logs.getLogger(serviceName);
}
