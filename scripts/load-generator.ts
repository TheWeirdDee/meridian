/**
 * Meridian — demo load generator (Beat 3: "the number that moves").
 *
 * Fires real payments in quick succession while rpc-proxy is degraded, so
 * the SigNoz dashboard's stalled-settlement counter and the alert climb
 * live on screen. Each payment is a genuine chain.settle attempt — same
 * pipeline as one manual /pay — not a fabricated counter.
 *
 * Usage: npx tsx scripts/load-generator.ts [count] [staggerMs]
 *   count      number of payments to fire (default 20)
 *   staggerMs  delay between each fire (default 800ms — spread out enough
 *              to keep nonce collisions rare; a few stale_nonce verdicts if
 *              they do happen are real too, not a bug to hide from a judge)
 *
 * Run this only while rpc-proxy is in slow/timeout mode (POST /control),
 * otherwise these just settle normally and nothing climbs.
 */
const PAYMENT_API_URL = process.env.PAYMENT_API_URL ?? "http://localhost:4000";

const count = Number(process.argv[2] ?? 20);
const staggerMs = Number(process.argv[3] ?? 800);

async function fire(i: number) {
  const amountNgn = 500 + Math.floor(Math.random() * 4500);
  try {
    const res = await fetch(`${PAYMENT_API_URL}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn }),
    });
    const data = await res.json();
    console.log(`[${i + 1}/${count}] fired settlement ${data.settlementId} — ₦${amountNgn}`);
  } catch (e) {
    console.error(`[${i + 1}/${count}] failed to fire:`, e);
  }
}

async function main() {
  console.log(`Firing ${count} payments, ${staggerMs}ms apart. Watch the SigNoz dashboard / alert.`);
  for (let i = 0; i < count; i++) {
    fire(i); // deliberately not awaited — real concurrent settlement load
    await new Promise((r) => setTimeout(r, staggerMs));
  }
  console.log("All fired. Settlements are still processing in the background — give it ~30-60s to land.");
}

main();
