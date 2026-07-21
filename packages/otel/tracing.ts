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
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

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
    // Auto-instrument HTTP so cross-service context propagates for the SYNC hops
    // automatically. The ASYNC webhook hop is handled manually in context-bridge.ts.
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on("SIGTERM", () => {
    sdk?.shutdown().finally(() => process.exit(0));
  });
}
