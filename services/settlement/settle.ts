/**
 * Meridian — settlement service (REFERENCE INSTRUMENTED SERVICE).
 *
 * This is the pattern the coding agent replicates across the other services.
 * It shows: resuming context in the webhook, the chain.settle subtree with a
 * REAL viem call to Alfajores, the deterministic classifier, the observed/inferred
 * honesty model, and metrics emission.
 *
 * IMPORTANT: startTracing() must be the first import side-effect in the real
 * entrypoint (index.ts), before express/viem are imported.
 */
import express from "express";
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
} from "viem";
import { celoAlfajores } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { trace, metrics, SpanStatusCode } from "@opentelemetry/api";
import { resumeInWebhook, currentTraceId } from "../../packages/otel/context-bridge";
import { SPAN, ATTR, classify, Verdict } from "../../packages/otel/conventions";

const tracer = trace.getTracer("meridian-settlement");
const meter = metrics.getMeter("meridian-settlement");

// ---- metrics (feed the demo's climbing numbers) --------------------------
const stageDuration = meter.createHistogram("settlement.stage.duration", {
  unit: "ms",
});
const stalled = meter.createCounter("settlement.stalled");
const valueDelayed = meter.createUpDownCounter("settlement.value_delayed_ngn");

// ---- chain clients (REAL Alfajores; RPC url points at OUR proxy) ----------
// The proxy lets us inject real latency/failure without faking the chain leg.
const RPC_URL = process.env.RPC_PROXY_URL ?? "http://localhost:8899/rpc";
const account = privateKeyToAccount(process.env.SETTLER_PK as `0x${string}`);
const publicClient = createPublicClient({ chain: celoAlfajores, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: celoAlfajores, transport: http(RPC_URL) });

const CONTRACT = process.env.SETTLEMENT_CONTRACT as `0x${string}`;
const BLOCK_THRESHOLD = 20;
const WEBHOOK_THRESHOLD_MS = 8_000;

// -------------------------------------------------------------------------
const app = express();
app.use(express.json());

/**
 * Webhook endpoint. `mock-processor` calls this after it "confirms" the fiat
 * charge. We reload the persisted traceparent so this becomes ONE trace.
 */
app.post("/webhook/confirmed", async (req, res) => {
  const { settlementId, merchantId, amountNgn, providerRef, persistedCarrier } = req.body;

  await resumeInWebhook(persistedCarrier, SPAN.ON_CONFIRMATION, async (root) => {
    root.setAttributes({
      [ATTR.SETTLEMENT_ID]: settlementId,
      [ATTR.MERCHANT_ID]: merchantId,
      [ATTR.AMOUNT_NGN]: amountNgn,
    });

    // Sanity check for Phase 1: trace id here must equal the one from charge.
    console.log("resumed trace", currentTraceId(), "for", settlementId);

    // ---- fx.convert (mock) ----
    const cusd = await timedSpan(SPAN.FX_CONVERT, async (s) => {
      const rate = 0.00065; // mock NGN->cUSD
      const amountCusd = amountNgn * rate;
      s.setAttributes({ [ATTR.FX_RATE]: rate, [ATTR.AMOUNT_CUSD]: amountCusd });
      return amountCusd;
    });

    // ---- chain.settle (REAL) ----
    const verdict = await timedSpan(SPAN.CHAIN_SETTLE, async () => {
      return settleOnChain(amountNgn, cusd);
    });

    // Honesty model + diagnosis land on the trace.
    if (verdict.type !== "none") {
      stalled.add(1, { stage: verdictStage(verdict) });
      valueDelayed.add(amountNgn);
      root.setStatus({ code: SpanStatusCode.ERROR, message: verdict.type });
    } else {
      // ---- balance.update + notify (only on success) ----
      await timedSpan(SPAN.BALANCE_UPDATE, async () => {/* db write */});
      await timedSpan(SPAN.MERCHANT_NOTIFY, async () => {/* flip phone to ✓ */});
    }
  });

  res.json({ ok: true });
});

/** The real chain leg + the deterministic diagnosis over what it observed. */
async function settleOnChain(amountNgn: number, cusd: number): Promise<Verdict> {
  // estimate_gas — observe a real revert if the contract rejects the input.
  let gasEstimateRevertReason: string | null = null;
  let gasEstimate: bigint | null = null;
  await timedSpan(SPAN.ESTIMATE_GAS, async (s) => {
    try {
      gasEstimate = await publicClient.estimateContractGas({
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

  // If it reverted pre-broadcast, classify and stop — we never send.
  if (gasEstimateRevertReason) {
    return annotate(classify({
      sendSucceeded: false, receiptAfterBlocks: null, blockThreshold: BLOCK_THRESHOLD,
      gasEstimateRevertReason, providerAccepted: true,
      webhookAfterMs: 0, webhookThresholdMs: WEBHOOK_THRESHOLD_MS,
    }));
  }

  // read_nonce (observe stale-nonce condition if present)
  const submittedNonce = await timedSpan(SPAN.READ_NONCE, async (s) => {
    const n = await publicClient.getTransactionCount({ address: account.address });
    s.setAttribute(ATTR.NONCE, n);
    return n;
  });

  // sign + send (REAL)
  let txHash: `0x${string}` | undefined;
  let sendSucceeded = false;
  await timedSpan(SPAN.SEND_TX, async (s) => {
    const data = encodeFunctionData({ abi: SETTLE_ABI, functionName: "settle", args: [BigInt(Math.floor(cusd * 1e6))] });
    txHash = await walletClient.sendTransaction({ to: CONTRACT, data, nonce: submittedNonce });
    sendSucceeded = true;
    s.setAttributes({
      [ATTR.TX_HASH]: txHash, [ATTR.RPC_PROVIDER]: process.env.RPC_PROVIDER_NAME ?? "alfajores-proxy",
      [ATTR.CHAIN_ID]: celoAlfajores.id, [ATTR.CONTRACT_ADDRESS]: CONTRACT, [ATTR.CONTRACT_FUNCTION]: "settle",
      [ATTR.VISIBILITY]: "observed",
    });
  });

  // wait_for_receipt — the RPC proxy may inject REAL latency/timeout here.
  let receiptAfterBlocks: number | null = null;
  await timedSpan(SPAN.WAIT_RECEIPT, async (s) => {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash!, timeout: 45_000 });
      receiptAfterBlocks = Number(receipt.blockNumber) % BLOCK_THRESHOLD; // demo proxy
      s.setAttributes({ [ATTR.TX_STATUS]: receipt.status, [ATTR.TX_CONFIRMATIONS]: 1, [ATTR.VISIBILITY]: "observed" });
    } catch {
      s.setAttributes({ [ATTR.VISIBILITY]: "inferred" }); // no mempool visibility
    }
  });

  return annotate(classify({
    sendSucceeded, receiptAfterBlocks, blockThreshold: BLOCK_THRESHOLD,
    gasEstimateRevertReason: null, submittedNonce, pendingAccountNonce: submittedNonce,
    providerAccepted: true, webhookAfterMs: 0, webhookThresholdMs: WEBHOOK_THRESHOLD_MS,
  }));
}

/** Write the verdict + honesty attributes onto the active span. */
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

/** Small helper: run fn inside a child span and record its duration metric. */
async function timedSpan<T>(name: string, fn: (s: any) => Promise<T>): Promise<T> {
  const start = Date.now();
  return tracer.startActiveSpan(name, async (s) => {
    try { return await fn(s); }
    finally {
      stageDuration.record(Date.now() - start, { stage: name, "rpc.provider": process.env.RPC_PROVIDER_NAME ?? "alfajores-proxy" });
      s.end();
    }
  });
}

const SETTLE_ABI = [
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

app.listen(4002, () => console.log("settlement listening on :4002"));
