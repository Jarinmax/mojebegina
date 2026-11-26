// ODEČET OBALŮ PODLE OBJEDNÁVEK (Lucie 26. 11. 2026): obaly se odečtou ze
// skladu surovin a obalů HNED při vytvoření objednávky (e-shop i ruční /
// přes asistenta) — nečeká se na odeslání. Pojistka: když objednávka
// odečet ještě nemá (starší objednávky), odečte se při expedici. Storno
// obaly vrátí (opravný pohyb „in“). Nikdy nesmí shodit objednávku ani změnu
// stavu: volající chyby jen zaloguje.
//
// Přiřazení obalů (Lucie 26. 11. 2026, názvy podle Ceníku surovin a obalů):
//   3 l (polévky, sirupy, čaje, ovocné nápoje, koktejly) = Bag 3 l + Krabice 3 l
//   ochutnávka 100 ml / 200 ml                         = Kapsička stříbrná 250 ml
//   sirup 500 ml                                       = Kapsička stříbrná na sirup 500 ml
//   sirup 650 ml                                       = Kapsička stříbrná na sirup 650 ml
//   Ochutnávka polévek 3 × 450 ml                      = 3 × Kapsička průhledná 500 ml
//     (až dorazí stříbrné 500 ml, přepnout na stříbrné)
//   etikety se NEODEČÍTAJÍ (Lucie 26. 11. 2026: role se používají na obrázky
//     i složení libovolně, hlídá je Jarin a řekne, až budou docházet)
// Ostatní balení (sety…) zatím nic neodečítají.
import { sql, type SQL } from "drizzle-orm";

// Stejně jako variantStock.ts: db se předává (žádný import klienta → jde testovat).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExecDb = { execute: (query: SQL) => Promise<{ rows: any[] }> };

export const PACKAGING = {
  bag3l: "Bag 3 l (begina bez krabice)",
  box3l: "Krabice 3 l",
  pouch250: "Kapsička stříbrná 250 ml",
  syrup500: "Kapsička stříbrná na sirup 500 ml",
  syrup650: "Kapsička stříbrná na sirup 650 ml",
  clear500: "Kapsička průhledná 500 ml",
} as const;

// Etikety se zatím neodečítají (viz komentář nahoře).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const labels = (_count: number): PackagingNeed[] => [];

export type PackagingNeed = { name: string; quantity: number };

/** Obaly na jeden kus položky podle kategorie a objemu balení. */
export function packagingForItem(item: { categorySlug: string | null; volumeMl: number | null; sku: string | null }): PackagingNeed[] {
  const volume = item.volumeMl ?? 0;
  const sku = item.sku ?? "";
  if (item.categorySlug === "ochutnavka-provoz" || sku.startsWith("ochutnavka-")) {
    return volume === 100 || volume === 200 ? [{ name: PACKAGING.pouch250, quantity: 1 }, ...labels(1)] : [];
  }
  if (sku === "polevky-3x450") return [{ name: PACKAGING.clear500, quantity: 3 }, ...labels(3)];
  if (volume === 3000) return [{ name: PACKAGING.bag3l, quantity: 1 }, { name: PACKAGING.box3l, quantity: 1 }, ...labels(1)];
  if (item.categorySlug === "sirupy" && volume === 500) return [{ name: PACKAGING.syrup500, quantity: 1 }, ...labels(1)];
  if (item.categorySlug === "sirupy" && volume === 650) return [{ name: PACKAGING.syrup650, quantity: 1 }, ...labels(1)];
  return [];
}

/** Součet obalů za celou objednávku. */
export function packagingForOrder(items: Array<{ categorySlug: string | null; volumeMl: number | null; sku: string | null; quantity: number }>): PackagingNeed[] {
  const total = new Map<string, number>();
  for (const item of items) {
    for (const need of packagingForItem(item)) total.set(need.name, (total.get(need.name) ?? 0) + need.quantity * item.quantity);
  }
  return [...total.entries()].filter(([, q]) => q > 0).map(([name, quantity]) => ({ name, quantity }));
}

const tag = (orderId: string) => `[order:${orderId}]`;

async function tablesExist(db: ExecDb): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass('public.stock_movements') IS NOT NULL AS present`);
  return (r.rows?.[0] as { present?: boolean } | undefined)?.present === true;
}

/** Odečte obaly objednávky (jen jednou — dokud nejsou vrácené). */
export async function consumeOrderPackaging(orderId: string, db: ExecDb): Promise<PackagingNeed[]> {
  if (!(await tablesExist(db))) return [];
  const open = await db.execute(sql`
    SELECT 1 FROM stock_movements m
    WHERE m.direction = 'out' AND m.reason LIKE ${"%" + tag(orderId)}
      AND NOT EXISTS (SELECT 1 FROM stock_movements c WHERE c.corrects_movement_id = m.id)
    LIMIT 1`);
  if (open.rows.length > 0) return [];

  const rows = (
    await db.execute(sql`
      SELECT o.order_number, oi.quantity, oi.sku_snapshot AS sku, v.volume_ml, c.slug AS category_slug
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_variants v ON v.id = oi.product_variant_id
      LEFT JOIN products p ON p.id = v.product_id
      LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE oi.order_id = ${orderId}::uuid`)
  ).rows as Array<{ order_number: number | null; quantity: number; sku: string | null; volume_ml: number | null; category_slug: string | null }>;
  const needs = packagingForOrder(
    rows.map((r) => ({ categorySlug: r.category_slug, volumeMl: r.volume_ml === null ? null : Number(r.volume_ml), sku: r.sku, quantity: Number(r.quantity) }))
  );
  if (needs.length === 0) return [];

  const location = (await db.execute(sql`SELECT id FROM stock_locations WHERE is_active ORDER BY name LIMIT 1`)).rows[0] as { id: string } | undefined;
  if (!location) return [];
  const reason = `Objednávka ${rows[0]?.order_number ?? ""} ${tag(orderId)}`.replace(/\s+/g, " ");

  for (const need of needs) {
    let item = (await db.execute(sql`SELECT id FROM stock_items WHERE is_active AND lower(name) = lower(${need.name}) LIMIT 1`)).rows[0] as { id: string } | undefined;
    if (!item) {
      item = (
        await db.execute(sql`
          INSERT INTO stock_items (name, canonical_unit, kind) VALUES (${need.name}, 'ks', 'operating_supply') RETURNING id`)
      ).rows[0] as { id: string };
    }
    await db.execute(sql`
      INSERT INTO stock_movements (stock_item_id, stock_location_id, direction, quantity, recorded_by_user_id, reason)
      VALUES (${item.id}::uuid, ${location.id}::uuid, 'out', ${need.quantity}, 'system:expedice', ${reason})`);
  }
  return needs;
}

/** Vrátí obaly objednávky na sklad (vrácená expedice, storno). */
export async function restoreOrderPackaging(orderId: string, db: ExecDb): Promise<void> {
  if (!(await tablesExist(db))) return;
  await db.execute(sql`
    INSERT INTO stock_movements (stock_item_id, stock_location_id, direction, quantity, recorded_by_user_id, corrects_movement_id, reason)
    SELECT m.stock_item_id, m.stock_location_id, 'in', m.quantity, 'system:expedice', m.id,
           'Vrácení obalů – ' || m.reason
    FROM stock_movements m
    WHERE m.direction = 'out' AND m.reason LIKE ${"%" + tag(orderId)}
      AND NOT EXISTS (SELECT 1 FROM stock_movements c WHERE c.corrects_movement_id = m.id)`);
}
