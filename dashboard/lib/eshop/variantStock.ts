// Počet kusů skladem u vybraných balení e-shopu (Lucie 25. 11. 2026) —
// zatím sirupové kapsičky 650 ml, které se doprodávají. product_variants.stock_qty:
// NULL = počet se nehlídá (všechna ostatní balení), číslo = kolik kusů zbývá.
// Objednávka z e-shopu kusy hned odečte (ve stejné transakci jako zápis
// objednávky), na 0 se balení samo přepne na „Vyprodáno“, storno kusy vrátí.
// Do zaplnění sloupce (skript 157) všechno funguje jako dřív.
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const STOCK_CONSTRAINT = "product_variants_stock_qty_nonnegative";
export const STOCK_GONE_ERROR =
  "Některé balení ve vašem košíku se mezitím vyprodalo nebo ho nezbývá tolik kusů. Obnovte prosím stránku a upravte košík.";

/** Postgres „undefined_column“ / „undefined_table“ (i zabalený v DrizzleQueryError.cause). */
function isMissingSchema(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (code === "42703" || code === "42P01") return true;
  }
  return false;
}

export function isStockConstraintError(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if (e instanceof Error && e.message.includes(STOCK_CONSTRAINT)) return true;
    if ((e as { constraint?: unknown }).constraint === STOCK_CONSTRAINT) return true;
  }
  return false;
}

/** Hlídaná balení: SKU → zbývající kusy. Bez sloupce stock_qty prázdné. */
export async function loadStockQty(db: AnyDb): Promise<Map<string, number>> {
  try {
    const result = await db.execute<{ sku: string; stock_qty: number }>(
      sql`SELECT sku, stock_qty FROM product_variants WHERE is_active AND stock_qty IS NOT NULL`
    );
    const rows = (result as unknown as { rows?: Array<{ sku: string; stock_qty: number }> }).rows ?? (result as unknown as Array<{ sku: string; stock_qty: number }>);
    return new Map(rows.map((r) => [r.sku, Number(r.stock_qty)]));
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return new Map();
  }
}

let trackingReady: boolean | null = null;

/** Je v databázi sloupec stock_qty i tabulka rezervací (skript 157)? */
export async function stockTrackingReady(db: AnyDb): Promise<boolean> {
  if (trackingReady) return true;
  const result = await db.execute<{ ready: boolean }>(sql`
    SELECT (to_regclass('public.eshop_stock_reservations') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'stock_qty')) AS ready`);
  const rows = (result as unknown as { rows?: Array<{ ready: boolean }> }).rows ?? (result as unknown as Array<{ ready: boolean }>);
  trackingReady = rows[0]?.ready === true;
  return trackingReady;
}

/**
 * Příkazy do téže transakce jako zápis objednávky: odečet kusů u hlídaných
 * balení + záznam rezervace. Když kusů nezbývá dost, CHECK (stock_qty >= 0)
 * shodí celou transakci — objednávka se nezapíše.
 */
export function stockStatements(orderId: string, lines: Array<{ sku: string; quantity: number }>): SQL[] {
  return lines.flatMap((line) => [
    sql`INSERT INTO eshop_stock_reservations (order_id, variant_id, quantity)
        SELECT ${orderId}::uuid, id, ${line.quantity} FROM product_variants
        WHERE sku = ${line.sku} AND is_active AND stock_qty IS NOT NULL`,
    sql`UPDATE product_variants
        SET stock_qty = stock_qty - ${line.quantity},
            sold_out = sold_out OR stock_qty - ${line.quantity} <= 0,
            updated_at = now()
        WHERE sku = ${line.sku} AND is_active AND stock_qty IS NOT NULL`,
  ]);
}

/** Storno: vrátí odečtené kusy (jen jednou); balení vyprodané na nule znovu otevře. */
export async function releaseOrderStock(db: AnyDb, orderId: string): Promise<void> {
  if (!(await stockTrackingReady(db))) return;
  await db.execute(sql`
    WITH released AS (
      UPDATE eshop_stock_reservations SET released_at = now()
      WHERE order_id = ${orderId}::uuid AND released_at IS NULL
      RETURNING variant_id, quantity
    ), per_variant AS (
      SELECT variant_id, sum(quantity)::int AS quantity FROM released GROUP BY variant_id
    )
    UPDATE product_variants v
    SET sold_out = CASE WHEN v.stock_qty <= 0 THEN false ELSE v.sold_out END,
        stock_qty = v.stock_qty + p.quantity,
        updated_at = now()
    FROM per_variant p
    WHERE v.id = p.variant_id AND v.stock_qty IS NOT NULL`);
}
