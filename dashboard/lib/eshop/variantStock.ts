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

/**
 * Ruční objednávka zadaná přes asistenta (create_order): kusy se odečtou taky,
 * ale objednávku nikdy nezablokují — zboží už většinou odešlo. Odečte se
 * nejvýš to, co zbývá (na nule se balení vyprodá), rezervace = skutečně odečtené
 * kusy, aby je storno vrátilo přesně.
 */
export function manualStockStatements(orderId: string, items: Array<{ variantId: string | null; quantity: number }>): SQL[] {
  return items
    .filter((item): item is { variantId: string; quantity: number } => Boolean(item.variantId) && item.quantity > 0)
    .flatMap((item) => [
      sql`INSERT INTO eshop_stock_reservations (order_id, variant_id, quantity)
          SELECT o.id, v.id, LEAST(${item.quantity}, v.stock_qty) FROM product_variants v, orders o
          WHERE v.id = ${item.variantId}::uuid AND v.stock_qty > 0 AND o.id = ${orderId}::uuid`,
      sql`UPDATE product_variants
          SET stock_qty = GREATEST(stock_qty - ${item.quantity}, 0),
              sold_out = sold_out OR stock_qty - ${item.quantity} <= 0,
              updated_at = now()
          WHERE id = ${item.variantId}::uuid AND stock_qty IS NOT NULL
            AND EXISTS (SELECT 1 FROM orders WHERE id = ${orderId}::uuid)`,
    ]);
}

export type StockRow = { sku: string; product: string; label: string | null; stockQty: number; soldOut: boolean };

/** Hlídaná balení s počtem kusů (pro asistenta a Řízení firmy). */
export async function listTrackedStock(db: AnyDb): Promise<StockRow[]> {
  if (!(await stockTrackingReady(db))) return [];
  const result = await db.execute<{ sku: string; product: string; label: string | null; stock_qty: number; sold_out: boolean }>(sql`
    SELECT v.sku, p.name AS product, v.label, v.stock_qty, v.sold_out
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.stock_qty IS NOT NULL ORDER BY p.name, v.label`);
  const rows = (result as unknown as { rows?: Array<{ sku: string; product: string; label: string | null; stock_qty: number; sold_out: boolean }> }).rows ?? [];
  return rows.map((r) => ({ sku: r.sku, product: r.product, label: r.label, stockQty: Number(r.stock_qty), soldOut: r.sold_out }));
}

/**
 * Ruční úprava kusů (prodej v bistru, vzorek bez objednávky, inventura):
 * change = o kolik (záporné = výdej), nebo setTo = nový stav. Zapíše se do
 * eshop_stock_adjustments; na 0 vyprodá, nad 0 znovu otevře.
 */
export async function adjustVariantStock(
  db: AnyDb,
  input: { sku: string; change?: number; setTo?: number; reason: string; userId: string; userName: string | null }
): Promise<{ ok: true; row: StockRow } | { ok: false; error: string }> {
  if (!(await stockTrackingReady(db))) return { ok: false, error: "Hlídání kusů ještě není zapnuté (chybí skript 157)." };
  const target =
    input.setTo !== undefined ? sql`${input.setTo}::int` : sql`GREATEST(v.stock_qty + ${input.change ?? 0}::int, 0)`;
  const result = await db.execute<{ sku: string; before: number; after: number }>(sql`
    WITH cur AS (SELECT id, stock_qty FROM product_variants WHERE sku = ${input.sku} AND stock_qty IS NOT NULL FOR UPDATE),
    upd AS (
      UPDATE product_variants v SET stock_qty = ${target}, sold_out = (${target}) <= 0, updated_at = now()
      FROM cur WHERE v.id = cur.id
      RETURNING v.id, v.sku, cur.stock_qty AS before, v.stock_qty AS after
    ), log AS (
      INSERT INTO eshop_stock_adjustments (variant_id, quantity_before, quantity_after, reason, author_user_id, author_name)
      SELECT id, before, after, ${input.reason}, ${input.userId}, ${input.userName} FROM upd
    )
    SELECT sku, before, after FROM upd`);
  const rows = (result as unknown as { rows?: Array<{ sku: string }> }).rows ?? [];
  if (rows.length === 0) return { ok: false, error: `Balení ${input.sku} nemá hlídaný počet kusů.` };
  const row = (await listTrackedStock(db)).find((r) => r.sku === input.sku);
  return row ? { ok: true, row } : { ok: false, error: "Úprava proběhla, ale stav se nepodařilo načíst." };
}

/** Název hlídaného balení, jak se nabízí ve formuláři „Nová objednávka“ (např. „Zázvorový sirup 650 ml“). */
export function trackedDisplayName(row: Pick<StockRow, "product" | "label">): string {
  return `${row.product}${row.label ? ` ${row.label}` : ""}`.trim();
}

/** Hlídané balení podle přesného názvu položky (bez ohledu na velikost písmen a mezery). */
export async function trackedVariantIdsByName(db: AnyDb): Promise<Map<string, { variantId: string; sku: string }>> {
  if (!(await stockTrackingReady(db))) return new Map();
  const result = await db.execute<{ id: string; sku: string; product: string; label: string | null }>(sql`
    SELECT v.id, v.sku, p.name AS product, v.label FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.stock_qty IS NOT NULL`);
  const rows = (result as unknown as { rows?: Array<{ id: string; sku: string; product: string; label: string | null }> }).rows ?? [];
  return new Map(rows.map((r) => [normName(trackedDisplayName(r)), { variantId: r.id, sku: r.sku }]));
}

export function normName(name: string): string {
  return name.trim().toLocaleLowerCase("cs").replace(/\s+/g, " ");
}
