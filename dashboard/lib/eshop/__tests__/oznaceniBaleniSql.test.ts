// docs/eshop-production/72_oznaceni_baleni_MAIN.sql nad PGlite se všemi
// migracemi a katalogy: štítky balení „Begina 3 l“ / „500 ml“ / „750 g“, text
// kategorií bez „bag-in-box“, ceny a SKU beze změny, opakované spuštění nic
// nezmění (pojistka).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const catalog = (name: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", name), "utf8");
// pojistka na Production se v testu přeskočí (PGlite nemá neon.timeline_id)
const SCRIPT = readFileSync(path.join(ROOT, "docs/eshop-production/72_oznaceni_baleni_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);

describe("72: označení balení jen množstvím", { timeout: 120_000 }, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const name of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "71_ovocne_napoje.sql"]) await pg.exec(catalog(name));
    // stav před skriptem 72 (8. 11. 2026): sirupy ještě s dlouhými štítky — katalog
    // 31 má od 9. 11. 2026 rovnou „3 l“ / „700 ml“ (skript 80)
    await pg.query(`UPDATE "product_variants" SET "label" = CASE WHEN "sku" LIKE '%-3l' THEN '3 l Rodinná zásoba (bag-in-box)' ELSE '750 g Praktické balení' END WHERE "sku" LIKE '%sirup%'`);
  }, 120_000);

  it("přepíše jen štítky a větu o bag-in-box, ceny a SKU zůstanou", async () => {
    const before = await pg.query<{ sku: string; price: number }>(`SELECT "sku", "price_b2c_kc" AS price FROM "product_variants" ORDER BY "sku"`);
    expect((await pg.query(`SELECT 1 FROM "product_variants" WHERE "label" ~* 'bag-in-box|praktické balení'`)).rows.length).toBeGreaterThan(0);
    await pg.exec(SCRIPT);
    const labels = await pg.query<{ label: string }>(`SELECT DISTINCT "label" FROM "product_variants" WHERE "label" IS NOT NULL ORDER BY 1`);
    for (const { label } of labels.rows) expect(label).toMatch(/^(Begina 3 l|\d+(,\d+)? (ml|kg|g))$/);
    expect(labels.rows.map((r) => r.label)).toEqual(expect.arrayContaining(["Begina 3 l", "750 g"]));
    const after = await pg.query<{ sku: string; price: number }>(`SELECT "sku", "price_b2c_kc" AS price FROM "product_variants" ORDER BY "sku"`);
    expect(after.rows).toEqual(before.rows);
    const box = await pg.query(`SELECT 1 FROM "product_categories" WHERE "detail_sections"::text ILIKE '%bag-in-box%'`);
    expect(box.rows).toEqual([]);
  });

  it("opakované spuštění zastaví pojistka", async () => {
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/Nic k úpravě/);
    await pg.exec("ROLLBACK");
  });
});
