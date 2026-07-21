/**
 * Meridian — semantic convention for the fiat→chain settlement trace.
 * This file IS the intellectual core of the project. It defines what an
 * on-chain-crossing payment trace means. Reuse everywhere; do not inline
 * span names or attribute keys elsewhere.
 */

/** Span names — the settlement lifecycle. */
export const SPAN = {
  RECEIVE_PAYMENT: "settlement.receive_payment", // root
  CREATE_RECORD: "payment.create_record",
  PROVIDER_CHARGE: "payment.provider.charge", // observed boundary (processor)
  ON_CONFIRMATION: "settlement.on_confirmation", // context restored after webhook
  FX_CONVERT: "fx.convert",
  CHAIN_SETTLE: "chain.settle",
  ESTIMATE_GAS: "chain.estimate_gas",
  READ_NONCE: "chain.read_nonce",
  WALLET_SIGN: "wallet.sign",
  SEND_TX: "rpc.send_transaction",
  WAIT_RECEIPT: "chain.wait_for_receipt", // observed→inferred boundary (mempool)
  BALANCE_UPDATE: "balance.update",
  MERCHANT_NOTIFY: "merchant.notify",
} as const;

/** Attribute keys — namespaced, stable. */
export const ATTR = {
  MERCHANT_ID: "merchant.id",
  SETTLEMENT_ID: "settlement.id",
  AMOUNT_NGN: "amount.ngn",
  AMOUNT_CUSD: "amount.cusd",
  AMOUNT_CURRENCY: "amount.currency",
  FX_RATE: "fx.rate",
  PAYMENT_PROVIDER: "payment.provider",
  PROVIDER_REF: "payment.provider.ref",
  PAYMENT_STATUS: "payment.status",
  TX_HASH: "tx.hash",
  TX_STATUS: "tx.status",
  TX_CONFIRMATIONS: "tx.confirmations",
  RPC_PROVIDER: "rpc.provider",
  CHAIN_ID: "chain.id",
  CONTRACT_ADDRESS: "contract.address",
  CONTRACT_FUNCTION: "contract.function",
  GAS_ESTIMATE: "chain.gas_estimate",
  NONCE: "chain.nonce",
  // diagnosis + honesty model
  DIAGNOSIS_TYPE: "diagnosis.type",
  DIAGNOSIS_CONFIDENCE: "diagnosis.confidence",
  DIAGNOSIS_EVIDENCE: "diagnosis.evidence",
  VISIBILITY: "observability.visibility", // "observed" | "inferred"
} as const;

export type Visibility = "observed" | "inferred";
export type Confidence = "high" | "medium" | "low";

export type DiagnosisType =
  | "confirmation_timeout"
  | "contract_revert_pre_broadcast"
  | "stale_nonce"
  | "provider_stall"
  | "none";

export interface Verdict {
  type: DiagnosisType;
  confidence: Confidence;
  evidence: string;
  visibility: Visibility;
}

/**
 * The deterministic classifier. NO LLM. Same signals in, same verdict out.
 * `signals` are facts the instrumentation actually observed.
 */
export function classify(signals: {
  sendSucceeded: boolean;
  receiptAfterBlocks: number | null; // null = no receipt yet
  blockThreshold: number;
  gasEstimateRevertReason?: string | null;
  submittedNonce?: number | null;
  pendingAccountNonce?: number | null;
  providerAccepted: boolean;
  webhookAfterMs: number | null; // null = webhook never arrived
  webhookThresholdMs: number;
}): Verdict {
  // Pre-broadcast contract revert — observed, high confidence.
  if (signals.gasEstimateRevertReason) {
    return {
      type: "contract_revert_pre_broadcast",
      confidence: "high",
      evidence: `estimate_gas reverted: ${signals.gasEstimateRevertReason}`,
      visibility: "observed",
    };
  }

  // Stale nonce — observed, high confidence.
  if (
    signals.submittedNonce != null &&
    signals.pendingAccountNonce != null &&
    signals.submittedNonce < signals.pendingAccountNonce
  ) {
    return {
      type: "stale_nonce",
      confidence: "high",
      evidence: `submitted nonce ${signals.submittedNonce} < pending account nonce ${signals.pendingAccountNonce}`,
      visibility: "observed",
    };
  }

  // Processor stall — accepted but webhook never came. Inferred (visibility ends
  // at the processor boundary), medium confidence.
  if (
    signals.providerAccepted &&
    (signals.webhookAfterMs === null ||
      signals.webhookAfterMs > signals.webhookThresholdMs)
  ) {
    return {
      type: "provider_stall",
      confidence: "medium",
      evidence: "provider accepted charge; no webhook past the processor boundary — no visibility inside the processor",
      visibility: "inferred",
    };
  }

  // Confirmation timeout — sent, no receipt after N blocks. Inferred (no mempool
  // visibility), low confidence: could be dropped or underpriced, we can't see which.
  if (
    signals.sendSucceeded &&
    (signals.receiptAfterBlocks === null ||
      signals.receiptAfterBlocks > signals.blockThreshold)
  ) {
    return {
      type: "confirmation_timeout",
      confidence: "low",
      evidence: "transaction sent; no receipt after threshold; no mempool visibility from provider (dropped vs underpriced indistinguishable)",
      visibility: "inferred",
    };
  }

  return { type: "none", confidence: "high", evidence: "settled", visibility: "observed" };
}
