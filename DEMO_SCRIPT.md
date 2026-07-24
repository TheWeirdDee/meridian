# MERIDIAN — Demo Script (≈90 seconds)

Design principle: **demo the merchant's money, not the tool.** The trace is *how*; the naira, the seconds, and the phone going green are what they remember. Structure it as a **reveal**, not a tour.

Rule: the word "nonce" is never spoken. Blockchain internals are Q&A-only.

---

## Pre-roll setup (do this before recording, not during)

1. **Docker Desktop running**, then bring up the stack:
   ```
   docker start meridian-postgres
   # SigNoz stack (signoz-*, signoz-mcp) should already be running via Foundry —
   # if not: cd <project root> && foundryctl cast
   ```
2. **Start all four services** (each in its own terminal, or backgrounded):
   ```
   npx tsx services/payment-api/index.ts
   npx tsx services/mock-processor/index.ts
   npx tsx services/settlement/index.ts
   npx tsx services/rpc-proxy/index.ts
   npm run dev            # Next.js app on :3000
   ```
3. **Reset control state to known-good** (stale state from earlier testing will ruin a take):
   ```
   curl -X POST http://localhost:8899/control -H "Content-Type: application/json" -d '{"mode":"none"}'
   curl -X POST http://localhost:4002/control  -H "Content-Type: application/json" -d '{"receiptTimeoutMs":15000}'
   ```
4. **Windows on screen:** the phone UI (`localhost:3000/pay`) and SigNoz (`localhost:8080`), SigNoz hidden/minimized until Beat 2.
5. **Know where these live in SigNoz before recording:**
   - Traces → filter by `service.name = settlement` to find the three demo traces quickly.
   - Dashboards → "Meridian: Settlement Overview" for Beat 3's stalled-count / value-delayed panels.
   - Alerts → the three configured rules, to show one firing live in Beat 3.

---

## BEAT 1 — The lie everyone knows  (0:00–0:20)
**On screen:** just the phone. Nothing else.

**Action:** Open `localhost:3000/pay`, tap **"Pay ₦2,000."** Spinner. Text: **"Processing…"**

**Say:**
> "This is what every payment system on earth shows you right now. This merchant just got paid — and this is all she sees. Is the money coming? Gone? Stolen? She doesn't know. And here's the part that costs real companies real money: **her support team doesn't know either.**"

*(Beat. Let the spinner sit. Sell the helplessness before showing a single span.)*

---

## BEAT 2 — Three identical stalls, pulled apart  (0:20–0:55)
**This is the whole demo.** Trigger each failure with its live `/control` endpoint — no restarts, no code changes on screen.

**Action — three separate `/pay` calls, each preceded by its trigger:**

| Failure | Trigger (run right before tapping Pay) | What lands red |
|---|---|---|
| `provider_stall` | `curl -X POST http://localhost:4001/control -d '{"stall":true}'` | `payment.provider.charge` |
| `contract_revert_pre_broadcast` | none needed — just pay `₦0`: `{"amountNgn": 0}` | `chain.estimate_gas` |
| `confirmation_timeout` | `curl -X POST http://localhost:8899/control -d '{"mode":"timeout"}'` | `chain.wait_for_receipt` |

**Reset each trigger back (`stall:false`, `mode:none`) before moving to the next**, so they don't compound.

**Say (while all three show the same spinner):**
> "Same word. Same spinner. Three times. To her, these are the exact same failure. Watch what one trace sees."

**Action:** Bring up SigNoz. Open the **three traces side by side** (filter `service.name=settlement`, sorted by recent). Three different red spans light up exactly as in the table above.

**Say:**
> "Three failures that were pixel-identical to the merchant. One died at the payment processor. One reverted before it ever reached the chain. One is stuck waiting for confirmation. **Same spinner — three completely different bugs — and the trace told them apart in two seconds.**"

**Action:** Click into the `provider_stall` trace's dark region — where visibility ends at the processor boundary.

**Say (the honesty beat, delivered as confidence):**
> "And here's where I'll be honest with you. A demo that claims total visibility is lying. *This* line is where my instrumentation can see, and past it I'm inferring from what came back — and I tell you which is which. It still says: the payment died at the processor, medium confidence, here's the evidence."

*(A demo that draws its own limit is the one they trust.)*

---

## BEAT 3 — The number that moves  (0:55–1:20)
**On screen:** switch to the **SigNoz dashboard** ("Meridian: Settlement Overview").

**Say:**
> "That was one merchant. Here's the fleet."

**Action — degrade the RPC, then generate real load:**
```
curl -X POST http://localhost:8899/control -H "Content-Type: application/json" -d '{"mode":"slow"}'
npx tsx scripts/load-generator.ts 20 800
```
This fires 20 real payments, staggered 800ms apart, all hitting the degraded RPC. Give it 30–60s — the **"Settlements stalled"** panel and the **value-delayed gauge** climb live on screen as they land. Whatever number appears is real (don't narrate a specific target like "127" — say the number actually on screen).

**Say:**
> "[N] merchants, ₦[X] in settlements, all stalled at the same step — and the system flagged it **before a single support ticket.**" *(point at the fired alert)* "Nobody had to notice. The system noticed first."

---

## BEAT 4 — Close on green (the recovery)  (1:20–1:35)
**Action — reroute to a healthy RPC while a settlement is genuinely still stuck:**
```
curl -X POST http://localhost:8899/control -d '{"mode":"timeout"}'
curl -X POST http://localhost:4002/control  -d '{"receiptTimeoutMs":40000}'
```
Trigger one more `/pay` on the **original phone from Beat 1** (still on screen). It goes to "Processing…" and holds. Give it roughly 15–25s (real testnet `estimate_gas` latency varies run to run — watch the terminal running `settlement`, not a stopwatch: once you see `rpc.send_transaction` land in the log or trace, the retry loop is live). Then:
```
curl -X POST http://localhost:8899/control -d '{"mode":"none"}'
```
The **same** phone, **same** settlement, flips **"Processing…" → "Received ✓"** within a few seconds — no restart, no new payment.

**Say:**
> "Reroute to a healthy provider — and she gets her money. One payment, fiat to blockchain, followed the whole way, in one trace. That's Meridian."

*(End on the phone going green. The room remembers the money, not the dashboard.)*

**Reset after recording:** `mode:none` and `receiptTimeoutMs:15000` — same commands as pre-roll step 3.

---

## The four-sentence pitch (for the submission / opening line)
> A single merchant payment crosses a processor, backend services, an FX step, and a blockchain before it settles — and when it stalls, every system just shows "pending," so nobody can tell which leg died. Meridian follows that payment across all of it, fiat rail to on-chain confirmation, as one distributed trace in SigNoz. The trace shows which span stalled, the dashboard shows how many merchants it's hitting, and the diagnosis names the cause from observed evidence — no guessing. Payments already span web2 and web3, and distributed tracing is the only practical way to see one business transaction across both worlds.

---

## Delivery notes
- Practice out loud, timed. Aim for 90s; 100s is the ceiling.
- Real testnet latency varies run to run (`chain.estimate_gas` has taken anywhere from 2s to 38s in testing) — rehearse Beats 2–4 enough to talk comfortably over variable wait time; don't script exact seconds into the narration.
- If a judge interrupts Beat 2 with "did you hardcode that?" — that's the best question you can get. Answer: "No — open the RPC proxy; it's injecting real latency into a real Celo Sepolia call, and the span is timing the real wait. Here's the tx hash on the explorer." Then show it.
- Built with AI assistance (Claude Code) — disclosed per the hackathon rules; see the README.
