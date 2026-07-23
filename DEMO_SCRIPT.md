# MERIDIAN — Demo Script (≈90 seconds)

Design principle: **demo the merchant's money, not the tool.** The trace is *how*; the naira, the seconds, and the phone going green are what they remember. Structure it as a **reveal**, not a tour. Build the app to serve this script — not the other way around.

Rule: the word "nonce" is never spoken. Blockchain internals are Q&A-only.

---

## Pre-roll setup (before you speak)
- Two things on screen: the **merchant phone UI** (left) and **SigNoz** (right, hidden until beat 2).
- Three failure modes pre-armed and reproducible on a single click each.
- The `value_delayed_ngn` counter and the fleet load generator ready for beat 3.

---

## BEAT 1 — The lie everyone knows  (0:00–0:20)
**On screen:** just the phone. Nothing else.

**Action:** Tap **"Receive ₦2,000."** Spinner. Text: **"Payment pending."**

**Say:**
> "This is what every payment system on earth shows you right now. This merchant just got paid — and this is all she sees. Is the money coming? Gone? Stolen? She doesn't know. And here's the part that costs real companies real money: **her support team doesn't know either.**"

*(Beat. Let the spinner sit. Sell the helplessness before showing a single span.)*

---

## BEAT 2 — Three identical stalls, pulled apart  (0:20–0:55)
**This is the 84→25 moment. It is the whole demo.**

**Action:** Run the payment **three times**. Each time: the *same* spinner, the *same* "pending." Three identical screens.

**Say:**
> "Same word. Same spinner. Three times. To her, these are the exact same failure. Watch what one trace sees."

**Action:** Bring up SigNoz. Open the **three traces side by side.** Three different red spans light up:
- Trace A — red at **`payment.provider.charge`** (processor stall)
- Trace B — red at **`chain.estimate_gas`** (reverted before it ever broadcast)
- Trace C — red at **`chain.wait_for_receipt`** (stuck on confirmation, 47s)

**Say:**
> "Three failures that were pixel-identical to the merchant. One died at the payment processor. One reverted before it ever reached the chain. One is stuck waiting for confirmation. **Same spinner — three completely different bugs — and the trace told them apart in two seconds.**"

**Action:** Click into Trace A's dark region — where visibility ends at the processor.

**Say (the honesty beat, delivered as confidence):**
> "And here's where I'll be honest with you. A demo that claims total visibility is lying. *This* line is where my instrumentation can see, and past it I'm inferring from what came back — and I tell you which is which. It still says: the payment died at the processor, medium confidence, here's the evidence."

*(A demo that draws its own limit is the one they trust.)*

---

## BEAT 3 — The number that moves  (0:55–1:20)
**On screen:** switch to the **Tracing Funnel** and the delayed-value counter.

**Say:**
> "That was one merchant. Here's the fleet."

**Action:** Trigger the load generator + real RPC degradation. The counter climbs live: **40 → 80 → 127** settlements stalling at the chain step. The **₦ delayed** figure climbs alongside: **₦254,000 delayed.** The **alert fires on screen.**

**Say:**
> "One hundred and twenty-seven merchants, ₦254,000 in settlements, all stalled at the same step — and the system flagged it **before a single support ticket.** Nobody had to notice. The system noticed first."

---

## BEAT 4 — Close on green  (1:20–1:30)
**Action:** Reroute to a healthy RPC provider (the recovery). The original **phone from beat 1** — still on screen — flips **"pending" → "₦2,000 received ✓."**

**Say:**
> "Reroute to a healthy provider — and she gets her money. One payment, fiat to blockchain, followed the whole way, in one trace. That's Meridian."

*(End on the phone going green. The room remembers the money, not the dashboard.)*

---

## The four-sentence pitch (for the submission / opening line)
> A single merchant payment crosses a processor, backend services, an FX step, and a blockchain before it settles — and when it stalls, every system just shows "pending," so nobody can tell which leg died. Meridian follows that payment across all of it, fiat rail to on-chain confirmation, as one distributed trace in SigNoz. The trace shows which span stalled, Funnels show how many merchants it's hitting, and the diagnosis names the cause from observed evidence — no guessing. Payments already span web2 and web3, and distributed tracing is the only practical way to see one business transaction across both worlds.

---

## Delivery notes (Dami rules VII–X)
- Practice out loud, timed. Aim for 90s; 100s is the ceiling.
- Video: Remotion + ElevenLabs voice; one design pass so deck, dashboard, and video share a palette.
- Consistency reads as "finished." Inconsistency reads as "unfinished."
- If a judge interrupts beat 2 with "did you hardcode that?" — that's the best question you can get. Answer: "No — open the RPC proxy; it's injecting real latency into a real Celo Sepolia call, and the span is timing the real wait. Here's the tx hash on the explorer." Then show it.
