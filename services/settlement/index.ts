/**
 * Meridian — settlement (Phase 3: real chain leg + failure diagnosis).
 *
 * chain.settle is real: viem + Celo Sepolia (Alfajores was sunset — see
 * log.md), routed through rpc-proxy so RPC-level failure injection (Phase 3's
 * confirmation_timeout) has a real seam. contract_revert_pre_broadcast comes
 * from calling settle(0), which genuinely reverts against the deployed
 * contract's own require(amount > 0) — see contracts/Settlement.sol.
 * provider_stall is NOT detected here — the webhook that would trigger this
 * handler never arrives in that case, so payment-api's own watchdog (the
 * only service positioned to notice an absence) declares it instead. See
 * services/payment-api/index.ts.
 *
 * Import order matters: startTracing() must run before express/anything else.
 */
import "dotenv/config";
import { startTracing } from "../../packages/otel/tracing";
startTracing("settlement");

import express from "express";
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
} from "viem";
import { celoSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { trace, metrics, SpanStatusCode } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { resumeInWebhook, currentTraceId } from "../../packages/otel/context-bridge";
import { getLogger } from "../../packages/otel/tracing";
import {
  SPAN,
  ATTR,
  classify,
  Verdict,
  BLOCK_THRESHOLD,
  WEBHOOK_THRESHOLD_MS,
} from "../../packages/otel/conventions";
import { getSettlement, updateSettlementStatus } from "../../packages/db/settlements";

const tracer = trace.getTracer("meridian-settlement");
const meter = metrics.getMeter("meridian-settlement");
const logger = getLogger("settlement");

const stageDuration = meter.createHistogram("settlement.stage.duration", { unit: "ms" });
const stalled = meter.createCounter("settlement.stalled");
const valueDelayed = meter.createUpDownCounter("settlement.value_delayed_ngn");

const RPC_URL = process.env.RPC_PROXY_URL ?? "http://localhost:8899/rpc";
const RPC_PROVIDER_NAME = process.env.RPC_PROVIDER_NAME ?? "celo-sepolia-proxy";
const account = privateKeyToAccount(process.env.SETTLER_PK as `0x${string}`);
const publicClient = createPublicClient({ chain: celoSepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: celoSepolia, transport: http(RPC_URL) });

const CONTRACT = process.env.SETTLEMENT_CONTRACT as `0x${string}`;
const RECEIPT_TIMEOUT_MS = Number(process.env.RECEIPT_TIMEOUT_MS ?? 15_000);

const SETTLE_ABI = [
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

const app = express();
app.use(express.json());

app.post("/webhook/confirmed", async (req, res) => {
  const { settlementId, providerRef } = req.body;

  const record = await getSettlement(settlementId);
  if (!record || !record.traceparent) {
    res.status(404).json({ error: "unknown settlement or missing traceparent" });
    return;
  }

  // Mark "processing" immediately, before any chain work — this is what lets
  // payment-api's stall watchdog tell "webhook arrived, still working" apart
  // from "webhook never arrived at all" (see services/payment-api/index.ts;
  // found via testing that without this, a genuinely-slow-but-real RPC call
  // produced a false-positive provider_stall verdict).
  await updateSettlementStatus(settlementId, "processing", providerRef);

  await resumeInWebhook({ traceparent: record.traceparent }, SPAN.ON_CONFIRMATION, async (root) => {
    root.setAttributes({
      [ATTR.SETTLEMENT_ID]: settlementId,
      [ATTR.MERCHANT_ID]: record.merchantId,
      [ATTR.AMOUNT_NGN]: Number(record.amountNgn),
    });

    console.log("resumed trace", currentTraceId(), "for", settlementId);
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: `webhook resumed trace for ${settlementId}`,
      attributes: { [ATTR.SETTLEMENT_ID]: settlementId },
    });

    const amountNgn = Number(record.amountNgn);

    const cusd = await timedSpan(SPAN.FX_CONVERT, async (s) => {
      const rate = 0.00065; // mock NGN -> cUSD
      const amountCusd = amountNgn * rate;
      s.setAttributes({ [ATTR.FX_RATE]: rate, [ATTR.AMOUNT_CUSD]: amountCusd });
      return amountCusd;
    });

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: `starting chain.settle for ${settlementId}: ${amountNgn} NGN -> ${cusd.toFixed(4)} cUSD`,
      attributes: { [ATTR.SETTLEMENT_ID]: settlementId, [ATTR.AMOUNT_CUSD]: cusd },
    });

    const verdict = await timedSpan(SPAN.CHAIN_SETTLE, async () => settleOnChain(amountNgn, cusd));

    if (verdict.type !== "none") {
      stalled.add(1, { stage: verdictStage(verdict) });
      valueDelayed.add(amountNgn);
      root.setStatus({ code: SpanStatusCode.ERROR, message: verdict.type });
      await updateSettlementStatus(settlementId, verdict.type, providerRef);
      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: `settlement ${settlementId} diagnosed as ${verdict.type}: ${verdict.evidence}`,
        attributes: {
          [ATTR.SETTLEMENT_ID]: settlementId,
          [ATTR.DIAGNOSIS_TYPE]: verdict.type,
          [ATTR.DIAGNOSIS_CONFIDENCE]: verdict.confidence,
          [ATTR.VISIBILITY]: verdict.visibility,
        },
      });
    } else {
      await timedSpan(SPAN.BALANCE_UPDATE, async () => {
        await updateSettlementStatus(settlementId, "confirmed", providerRef);
      });
      await timedSpan(SPAN.MERCHANT_NOTIFY, async () => {
        // Mock push. Web UI observes via GET /status polling and flips to "received ✓".
      });
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: `settlement ${settlementId} confirmed`,
        attributes: { [ATTR.SETTLEMENT_ID]: settlementId },
      });
    }
  });

  res.json({ ok: true });
});

/** The real chain leg + the deterministic diagnosis over what it observed. */
async function settleOnChain(_amountNgn: number, cusd: number): Promise<Verdict> {
  let gasEstimateRevertReason: string | null = null;
  await timedSpan(SPAN.ESTIMATE_GAS, async (s) => {
    try {
      const gasEstimate = await publicClient.estimateContractGas({
        address: CONTRACT,
        abi: SETTLE_ABI,
        functionName: "settle",
        args: [BigInt(Math.floor(cusd * 1e6))],
        account,
      });
      s.setAttribute(ATTR.GAS_ESTIMATE, Number(gasEstimate));
    } catch (e: any) {
      gasEstimateRevertReason = e?.shortMessage ?? String(e);
      s.setStatus({ code: SpanStatusCode.ERROR, message: gasEstimateRevertReason ?? "revert" });
    }
  });

  if (gasEstimateRevertReason) {
    return annotate(classify({
      sendSucceeded: false, receiptAfterBlocks: null, blockThreshold: BLOCK_THRESHOLD,
      gasEstimateRevertReason, providerAccepted: true,
      webhookAfterMs: 0, webhookThresholdMs: WEBHOOK_THRESHOLD_MS,
    }));
  }

  const submittedNonce = await timedSpan(SPAN.READ_NONCE, async (s) => {
    const n = await publicClient.getTransactionCount({ address: account.address });
    s.setAttribute(ATTR.NONCE, n);
    return n;
  });

  let txHash: `0x${string}` | undefined;
  let sendSucceeded = false;
  await timedSpan(SPAN.SEND_TX, async (s) => {
    const data = encodeFunctionData({ abi: SETTLE_ABI, functionName: "settle", args: [BigInt(Math.floor(cusd * 1e6))] });
    txHash = await walletClient.sendTransaction({ to: CONTRACT, data, nonce: submittedNonce });
    sendSucceeded = true;
    s.setAttributes({
      [ATTR.TX_HASH]: txHash,
      [ATTR.RPC_PROVIDER]: RPC_PROVIDER_NAME,
      [ATTR.CHAIN_ID]: celoSepolia.id,
      [ATTR.CONTRACT_ADDRESS]: CONTRACT,
      [ATTR.CONTRACT_FUNCTION]: "settle",
      [ATTR.VISIBILITY]: "observed",
    });
  });

  let receiptAfterBlocks: number | null = null;
  await timedSpan(SPAN.WAIT_RECEIPT, async (s) => {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash!, timeout: RECEIPT_TIMEOUT_MS });
      receiptAfterBlocks = 0;
      s.setAttributes({ [ATTR.TX_STATUS]: receipt.status, [ATTR.TX_CONFIRMATIONS]: 1, [ATTR.VISIBILITY]: "observed" });
    } catch {
      s.setAttributes({ [ATTR.VISIBILITY]: "inferred" });
    }
  });

  return annotate(classify({
    sendSucceeded, receiptAfterBlocks, blockThreshold: BLOCK_THRESHOLD,
    gasEstimateRevertReason: null, submittedNonce, pendingAccountNonce: submittedNonce,
    providerAccepted: true, webhookAfterMs: 0, webhookThresholdMs: WEBHOOK_THRESHOLD_MS,
  }));
}

function annotate(v: Verdict): Verdict {
  const s = trace.getActiveSpan();
  s?.setAttributes({
    [ATTR.DIAGNOSIS_TYPE]: v.type,
    [ATTR.DIAGNOSIS_CONFIDENCE]: v.confidence,
    [ATTR.DIAGNOSIS_EVIDENCE]: v.evidence,
    [ATTR.VISIBILITY]: v.visibility,
  });
  return v;
}

function verdictStage(v: Verdict): string {
  return v.type === "provider_stall" ? "provider.charge"
    : v.type === "contract_revert_pre_broadcast" ? "estimate_gas"
    : "wait_for_receipt";
}

async function timedSpan<T>(name: string, fn: (s: any) => Promise<T>): Promise<T> {
  const start = Date.now();
  return tracer.startActiveSpan(name, async (s) => {
    try { return await fn(s); }
    finally {
      stageDuration.record(Date.now() - start, { stage: name, "rpc.provider": RPC_PROVIDER_NAME });
      s.end();
    }
  });
}

const PORT = 4002;
app.listen(PORT, () => console.log(`settlement listening on :${PORT}`));
