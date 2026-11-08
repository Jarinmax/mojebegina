// docs/eshop-production/71_koktejly_ovocne_napoje_do_prodeje_MAIN.sql nad
// PGlite se všemi migracemi a katalogy (stav jako Production): po spuštění
// jde všech 6 produktů objednat, Lady Carneval má upozornění k barvivům,
// opakované spuštění nic nezmění (pojistka).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createCatalogIndex } from "../catalogIndex";
import { priceCart } from "../pricing";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const catalog = (name: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", name), "utf8");
// pojistka na Production se v testu přeskočí (PGlite nemá neon.timeline_id)
const SCRIPT = readFileSync(path.join(ROOT, "docs/eshop-production/71_koktejly_ovocne_napoje_do_prodeje_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const SKUS = ["lady-carneval-3l", "granatovy-bond-500ml", "kosmopolitan-3l", "cervankove-nebe-3l", "dum-u-jezera-3l", "malinovy-svarak-nealko-3l"];

describe("do prodeje: 3 koktejly + 3 Ovocné nápoje", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const order = async (sku: string) =>
    priceCart([{ sku, quantity: 1 }], "osobni-odber", createCatalogIndex(await loadCatalog(db)));

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    for (const name of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "61_zmrzliny.sql"]) await pg.exec(catalog(name));
  }, 120_000);

  it("před: žádný z 6 produktů nejde objednat", async () => {
    for (const sku of SKUS) expect((await order(sku)).ok, sku).toBe(false);
  });

  it("po: všech 6 jde objednat, bez alergenů, s hmotností; upozornění u Lady Carneval", async () => {
    await pg.exec(SCRIPT);
    for (const sku of SKUS) expect((await order(sku)).ok, sku).toBe(true);
    const { rows } = await pg.query<{ slug: string; allergens: string[]; warnings: string[] }>(
      `SELECT "slug", "allergens", "warnings" FROM "products" WHERE "slug" IN ('lady-carneval','granatovy-bond','kosmopolitan','cervankove-nebe','dum-u-jezera','malinovy-svarak-nealko') ORDER BY "slug"`
    );
    expect(rows.map((r) => [r.slug, r.allergens])).toEqual([
      ["cervankove-nebe", []],
      ["dum-u-jezera", []],
      ["granatovy-bond", []],
      ["kosmopolitan", []],
      ["lady-carneval", []],
      ["malinovy-svarak-nealko", []],
    ]);
    expect(rows.find((r) => r.slug === "lady-carneval")!.warnings).toContain(
      "E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí."
    );
    const weights = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "product_variants" WHERE "sku" IN ('cervankove-nebe-3l','dum-u-jezera-3l','malinovy-svarak-nealko-3l') AND "weight_g" = 3000`
    );
    expect(weights.rows[0].n).toBe(3);
    const catalogNow = await loadCatalog(db);
    expect(catalogNow.products.filter((p) => p.category === "ovocne-napoje").map((p) => p.slug)).toEqual([
      "cervankove-nebe",
      "dum-u-jezera",
      "malinovy-svarak-nealko",
    ]);
  });

  it("podruhé: pojistka zastaví a nic se nezmění", async () => {
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/Čekám 3 koktejly/);
    await pg.exec("ROLLBACK");
    const { rows } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "products" WHERE "slug" = 'lady-carneval' AND 'E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.' = ANY("warnings")`
    );
    expect(rows[0].n).toBe(1);
  });
});
