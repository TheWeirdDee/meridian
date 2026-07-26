# MERIDIAN — Demo Recording Script (simple version, one continuous take)

No editing needed. No multiple takes to stitch together. Hit record once, follow this top to bottom, stop recording at the end. Total time: under 3 minutes.

Rule: never say the word "nonce" — it's Q&A-only if a judge asks.

---

## Before you hit record

Run this once (confirms everything's reset and healthy):
```
curl -X POST http://localhost:8899/control -H "Content-Type: application/json" -d '{"mode":"none"}'
curl -X POST http://localhost:4002/control  -H "Content-Type: application/json" -d '{"receiptTimeoutMs":15000}'
curl -X POST http://localhost:4001/control  -H "Content-Type: application/json" -d '{"stall":false}'
```

Have **three browser tabs** open and ready to click between (don't open them mid-recording):
1. `localhost:3000/pay` — the phone screen
2. `localhost:8080` — SigNoz, on the Traces page, ready to search
3. A terminal window, ready to paste commands

Practice this once WITHOUT recording first, so the tab-switching feels natural.

---

## Start recording. Say this first (about 15 seconds):

> "Hi, I'm [your name] — this is Meridian. When a payment moves from a normal bank transfer into a real blockchain settlement and it gets stuck, support usually can't tell which of five or six systems it died in. Meridian traces the whole thing — including a real transaction on Celo Sepolia — as one connected trace in SigNoz, so a stuck payment becomes a two-second answer instead of a guess. Let me show you three payments that look identical to a customer, but are actually three completely different failures."

---

## The three failures — repeat this exact 4-step pattern three times

**For each of the three rows below, in order:**
1. Switch to the **terminal**, paste the one command shown (skip this step for row 2, there's no command)
2. Switch to the **phone tab**, tap **"Pay ₦2,000"** (or the amount shown)
3. Say the one line shown while it's processing
4. Once it settles, switch to **SigNoz → Traces**, click the most recent trace, point at the red span, say its name out loud

Reset the command back before moving to the next row (shown per row).

### Row 1 — payment processor breaks
- Run: `curl -X POST http://localhost:4001/control -d '{"stall":true}'`
- Tap Pay ₦2,000
- Say: *"This one breaks the payment processor itself."*
- Red span to point at: **`payment.provider.charge`**
- Reset: `curl -X POST http://localhost:4001/control -d '{"stall":false}'`

### Row 2 — blockchain call rejects before it's even sent
- No command needed — just pay **₦0** this one time (not ₦2,000)
- Say: *"This one breaks the blockchain call itself, before it's ever broadcast."*
- Red span to point at: **`chain.estimate_gas`**
- (nothing to reset)

### Row 3 — blockchain confirmation stalls
- Run: `curl -X POST http://localhost:8899/control -d '{"mode":"timeout"}'`
- Tap Pay ₦2,000
- Say: *"This one breaks confirmation on the chain side."*
- Red span to point at: **`chain.wait_for_receipt`**
- Reset: `curl -X POST http://localhost:8899/control -d '{"mode":"none"}'`

**After all three, say (about 10 seconds):**
> "Same spinner, every single time, on her screen. Three completely different causes underneath — and the trace told them apart instantly, every time. No LLM guessing — a deterministic rule reads the real signals and names the cause, with evidence."

---

## Close (about 15 seconds)

> "That's Meridian — one payment, one trace, from a fiat rail all the way to real on-chain settlement. Built on SigNoz: traces, a tracing funnel, alerts, a metrics dashboard, and logs, all self-hosted and reproducible. Thanks for watching."

**Stop recording.**

---

## If you have time/energy for a longer walkthrough later (not required for submission)

The full system also does two more things, not in the 3-minute video but real and working if a judge wants to see them live:
- **Fleet view**: `npx tsx scripts/load-generator.ts 20 800` after setting rpc-proxy to `slow` mode — watch the SigNoz dashboard's stalled-count and value-delayed gauge climb live, and an alert fire.
- **Recovery**: set `mode:timeout`, trigger a payment, wait ~15-25s, then set `mode:none` — the same stuck payment resolves to confirmed without a restart or a new payment.

Commands for both are in git history / can be re-added on request — cut from the main script only because they involve real unedited wait time that doesn't fit 3 minutes.

---

## The four-sentence pitch (for the written project description field)
> A single merchant payment crosses a processor, backend services, an FX step, and a blockchain before it settles — and when it stalls, every system just shows "pending," so nobody can tell which leg died. Meridian follows that payment across all of it, fiat rail to on-chain confirmation, as one distributed trace in SigNoz. The trace shows which span stalled, the dashboard shows how many merchants it's hitting, and the diagnosis names the cause from observed evidence — no guessing. Payments already span web2 and web3, and distributed tracing is the only practical way to see one business transaction across both worlds.

---

## Delivery notes
- Real testnet latency varies — the ₦0 revert (row 2) resolves almost instantly since it fails before broadcasting; rows 1 and 3 may take a few seconds longer. That's fine, keep talking naturally.
- If you stumble on a line, don't restart the whole recording — just pause, take a breath, and continue. Minor imperfection reads as authentic, not sloppy.
- Built with AI assistance (Claude Code) — disclosed per the hackathon rules; see the README.
