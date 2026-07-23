/**
 * Meridian — shared settlements table access.
 * `traceparent` is written in two steps: created NULL at payment.create_record,
 * set at payment.provider.charge (see ARCHITECTURE §4 — the webhook must link
 * back to the charge span specifically, not the record-creation span).
 */
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://postgres:meridian@localhost:5432/meridian",
});

export interface SettlementRecord {
  id: string;
  merchantId: string;
  amountNgn: string;
  status: string;
  traceparent: string | null;
  providerRef: string | null;
}

export async function createSettlement(rec: {
  id: string;
  merchantId: string;
  amountNgn: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO settlements (id, merchant_id, amount_ngn) VALUES ($1, $2, $3)`,
    [rec.id, rec.merchantId, rec.amountNgn],
  );
}

export async function setTraceparent(id: string, traceparent: string): Promise<void> {
  await pool.query(`UPDATE settlements SET traceparent = $2, updated_at = now() WHERE id = $1`, [
    id,
    traceparent,
  ]);
}

export async function getSettlement(id: string): Promise<SettlementRecord | null> {
  const { rows } = await pool.query(
    `SELECT id, merchant_id AS "merchantId", amount_ngn AS "amountNgn", status, traceparent, provider_ref AS "providerRef"
     FROM settlements WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface SettlementListRow extends SettlementRecord {
  createdAt: string;
  updatedAt: string;
}

/** Most recent settlements, newest first — powers the dashboard's live table. */
export async function listSettlements(limit = 50): Promise<SettlementListRow[]> {
  const { rows } = await pool.query(
    `SELECT id, merchant_id AS "merchantId", amount_ngn AS "amountNgn", status, traceparent, provider_ref AS "providerRef",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM settlements ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function updateSettlementStatus(
  id: string,
  status: string,
  providerRef?: string,
): Promise<void> {
  await pool.query(
    `UPDATE settlements SET status = $2, provider_ref = COALESCE($3, provider_ref), updated_at = now() WHERE id = $1`,
    [id, status, providerRef ?? null],
  );
}
