/**
 * Meridian — rpc-proxy (Phase 3: real failure injection).
 *
 * Sits between `settlement` and the real Celo Sepolia RPC. Normal job is
 * transparent pass-through, so the chain leg stays genuinely real.
 *
 * INJECT_MODE (settable live via POST /control, no restart needed for demos):
 *   none    — pass through immediately (default).
 *   slow    — delay ONLY eth_getTransactionReceipt calls by INJECT_DELAY_MS,
 *             then genuinely forward upstream. A real slow RPC, not faked —
 *             if the caller's own timeout is shorter than the delay, it
 *             times out for a real reason (the response really was late).
 *   timeout — never respond to eth_getTransactionReceipt at all. A real dead
 *             RPC path, discovered when the caller's own timeout fires.
 * Other JSON-RPC methods (estimate_gas, get_transaction_count, send_raw_
 * transaction) are never delayed — only receipt polling degrades, so the
 * send itself still genuinely lands on-chain while confirmation stalls.
 */
import "dotenv/config";
import { startTracing } from "../../packages/otel/tracing";
startTracing("rpc-proxy");

import express from "express";

const UPSTREAM_RPC =
  process.env.UPSTREAM_RPC ?? "https://forno.celo-sepolia.celo-testnet.org";
const INJECT_DELAY_MS = Number(process.env.INJECT_DELAY_MS ?? 20_000);

type InjectMode = "none" | "slow" | "timeout";
let injectMode: InjectMode = (process.env.INJECT_MODE as InjectMode) ?? "none";

const app = express();
app.use(express.json({ limit: "2mb" }));

function isReceiptCall(body: any): boolean {
  const methods = Array.isArray(body) ? body.map((b) => b?.method) : [body?.method];
  return methods.includes("eth_getTransactionReceipt");
}

app.post("/rpc", async (req, res) => {
  const targetsReceipt = isReceiptCall(req.body);

  if (targetsReceipt && injectMode === "timeout") {
    console.log("rpc-proxy: INJECT_MODE=timeout — withholding eth_getTransactionReceipt response");
    return; // never respond; caller's own timeout is what fires
  }

  if (targetsReceipt && injectMode === "slow") {
    console.log(`rpc-proxy: INJECT_MODE=slow — delaying eth_getTransactionReceipt by ${INJECT_DELAY_MS}ms`);
    await new Promise((r) => setTimeout(r, INJECT_DELAY_MS));
  }

  try {
    const upstreamRes = await fetch(UPSTREAM_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await upstreamRes.json();
    res.status(upstreamRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "rpc-proxy: upstream request failed", detail: String(err) });
  }
});

/** Live control for demos: POST /control { "mode": "none" | "slow" | "timeout" } */
app.post("/control", (req, res) => {
  const mode = req.body?.mode;
  if (mode !== "none" && mode !== "slow" && mode !== "timeout") {
    res.status(400).json({ error: "mode must be none|slow|timeout" });
    return;
  }
  injectMode = mode;
  console.log(`rpc-proxy: INJECT_MODE set to ${injectMode}`);
  res.json({ ok: true, injectMode });
});

app.get("/control", (_req, res) => res.json({ injectMode, INJECT_DELAY_MS }));

const PORT = 8899;
app.listen(PORT, () =>
  console.log(`rpc-proxy listening on :${PORT} (mode=${injectMode}, upstream=${UPSTREAM_RPC})`),
);
