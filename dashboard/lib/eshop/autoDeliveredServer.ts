import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { isAutoDeliveredDue } from "./autoDelivered";

/** Přepne odeslané objednávky po 2 pracovních dnech na Doručená; vrací čísla objednávek. */
export async function runAutoDelivered(now: Date = new Date()): Promise<number[]> {
  const rows = (
    await db.execute(sql`SELECT id, order_number, shipped_at FROM orders WHERE fulfillment_status = 'handed_to_carrier' AND shipped_at IS NOT NULL`)
  ).rows as { id: string; order_number: number | null; shipped_at: string | Date }[];
  const done: number[] = [];
  for (const row of rows) {
    if (!isAutoDeliveredDue(new Date(row.shipped_at), now)) continue;
    const result = await db.execute(sql`
      WITH upd AS (
        UPDATE orders SET fulfillment_status = 'delivered'
        WHERE id = ${row.id} AND fulfillment_status = 'handed_to_carrier'
        RETURNING id
      )
      INSERT INTO order_activity (order_id, actor_type, author_name, kind, body, metadata)
      SELECT id, 'system', 'MojeBegina', 'fulfillment_status_changed', 'Automaticky: 2 pracovní dny po předání přepravci',
             ${JSON.stringify({ from: "handed_to_carrier", to: "delivered", auto: true })}::jsonb FROM upd
      RETURNING id`);
    if (result.rows.length > 0 && row.order_number) done.push(row.order_number);
  }
  return done;
}
