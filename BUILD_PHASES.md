# MERIDIAN — Build Phases

Each phase ends with something demoable and a git commit. Newest-demoable-thing always exists, so a crashed later phase never leaves you with nothing.

Time is a fixed constraint (Jul 20–26). The three phase-0 decisions below shape every later line — make them before writing service code.

## Phase-0 decisions (make these first, do not discover them later)
- [ ] Failures are **injected as real conditions, discovered by instrumentation** — never hardcoded effects. (PRD §3.2)
- [ ] The **chain leg is real** (viem + Celo Sepolia); everything else is mock. (PRD §3.1)
- [ ] The **webhook context bridge** will likely fight you — the synchronous-poll fallback exists (ARCHITECTURE §4). Know it before you need it.

---

## Phase 0 — Skeleton + one span in SigNoz
**Goal:** prove the pipe end-to-end with the smallest possible payload.
- [ ] `docker-compose up` brings SigNoz up locally; UI reachable.
- [ ] `packages/otel` initializes the Node SDK and exports OTLP to SigNoz.
- [ ] One service (`payment-api`) emits **one span** on a `POST /pay`.
- [ ] That span appears in SigNoz Traces. Confirm service name, attributes.
- [ ] Commit: `phase-0: one span lands in SigNoz`.

**Demoable:** "a request produces a trace in SigNoz." Nothing more.

---

## Phase 1 — Full happy-path trace (all mock, no chain yet)
**Goal:** one connected green trace across every service, including across the webhook gap.
- [ ] `web` phone UI: a button that calls `payment-api` and polls for status.
- [ ] `payment-api` → `mock-processor` → (webhook) → `settlement` → db → notify.
- [ ] `settlement.id` generated, persisted, threaded through every hop.
- [ ] **Context bridge working:** `traceparent` persisted at charge, restored at webhook, `settlement.on_confirmation` linked back. **Verify in SigNoz that it is ONE trace, not two.**
- [ ] Phone flips to "received ✓" on the happy path.
- [ ] Commit: `phase-1: single connected trace, fiat path`.

**Demoable:** tap → one green trace top to bottom → phone goes ✓. If the trace splits into two, do not proceed — fix the bridge or take the sync fallback now.

**Risk flag:** this is the phase most likely to eat a day. Budget for it.

---

## Phase 2 — Real chain leg
**Goal:** the `chain.settle` subtree is real.
- [ ] Deploy the minimal settlement contract to Celo Sepolia; record address.
- [ ] `settlement` uses viem to estimate gas, read nonce, sign, send, wait for receipt against Celo Sepolia.
- [ ] Real `tx.hash` on the `rpc.send_transaction` span; real confirmation wait on `chain.wait_for_receipt`.
- [ ] RPC proxy service in place (pass-through mode).
- [ ] Commit: `phase-2: real Celo settlement in the trace`.

**Demoable:** the trace now contains a genuine on-chain span with a real tx hash you can open in the Celo explorer. **This is the differentiator — it must be real.**

---

## Phase 3 — Failure injection + deterministic diagnosis
**Goal:** the three failures, each discovered (not faked), each named.
- [ ] RPC proxy can inject real latency/timeout on receipt polling → `confirmation_timeout`.
- [ ] Contract call path that genuinely reverts → `contract_revert_pre_broadcast`.
- [ ] `mock-processor` "stall" mode: accepts, never fires webhook → `provider_stall`.
- [ ] Deterministic classifier populates `diagnosis.*` from observed signals (no LLM).
- [ ] `observability.visibility` set correctly (observed vs inferred) on each verdict.
- [ ] Commit: `phase-3: three real failures, three named verdicts`.

**Demoable:** run three times, three different red spans, three verdicts each with evidence. This is the core of the wow.

---

## Phase 4 — SigNoz layer (Best Use of SigNoz)
**Goal:** deep, SigNoz-specific usage — the named criterion.
- [ ] **Tracing Funnel** across the six steps; drop-off visible.
- [ ] **Alerts:** chain-receipt p95 breach; provider error-rate spike; "N settlements delayed."
- [ ] **Metrics panel:** per-provider p95; `value_delayed_ngn` gauge.
- [ ] **Logs** correlated to traces at each stage.
- [ ] A saved dashboard bundling the above.
- [ ] Commit: `phase-4: funnels, alerts, metrics, logs`.

**Demoable:** the fleet view — the climbing counter and the firing alert. **Do not skip this for time; it is the column the hackathon is named after.**

---

## Phase 5 — Demo, README, video, design pass
**Goal:** make it undeniable (Project B beats Project A).
- [ ] Run the demo script end-to-end, timed, out loud (Dami rule X).
- [ ] README: use-case (money problem) in first three lines; architecture diagram; how-to-run.
- [ ] Demo video (Remotion + ElevenLabs; consistent palette via one design pass).
- [ ] Q&A prep: the six hard questions with evidence-backed answers (see AGENT_PROMPT / handoff).
- [ ] Recovery beat wired: reroute to healthy RPC, phone flips to ✓ live.
- [ ] Commit: `phase-5: submission-ready`.

**Demoable:** the full 90-second reveal, money on screen, ending on green.

---

## Cut order if time runs short (sacrifice from the bottom up)
1. Keep: happy-path trace + real chain leg + the three failures + the demo reveal.
2. Then: Funnel + the receipt-p95 alert (minimum for Best Use of SigNoz).
3. Then: metrics panel, extra alerts.
4. First to cut: the recovery beat (nice-to-have), the sync fallback polish, multi-provider comparison.

Never cut: the real chain leg (kills the differentiator) or the observed/inferred honesty (kills the credibility).
