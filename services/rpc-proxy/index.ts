/**
 * Meridian — rpc-proxy (Phase 2: pass-through only).
 *
 * Sits between `settlement` and the real Celo Sepolia RPC. Normal job is
 * transparent pass-through, so the chain leg stays genuinely real. Phase 3
 * adds INJECT_MODE=slow|timeout here to delay/hang real eth_getTransactionReceipt
 * polls — a real degraded condition, not a hardcoded failure. Phase 2 only
 * wires the plumbing; INJECT_MODE is read but unused until Phase 3.
 */
import "dotenv/config";
import { startTracing } from "../../packages/otel/tracing";
startTracing("rpc-proxy");

import express from "express";

const UPSTREAM_RPC =
  process.env.UPSTREAM_RPC ?? "https://forno.celo-sepolia.celo-testnet.org";
const INJECT_MODE = process.env.INJECT_MODE ?? "none"; // none | slow | timeout (Phase 3)

const app = express();
app.use(express.json({ limit: "2mb" }));

app.post("/rpc", async (req, res) => {
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

const PORT = 8899;
app.listen(PORT, () =>
  console.log(`rpc-proxy listening on :${PORT} (mode=${INJECT_MODE}, upstream=${UPSTREAM_RPC})`),
);
