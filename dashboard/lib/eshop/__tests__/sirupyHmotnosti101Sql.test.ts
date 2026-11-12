// Skript 101 (skutečné hmotnosti sirupů) nad PGlite: stav Production =
// sirupy 3 l 3 000 g a 650 ml 750 g; po skriptu 3 800 g (s krabicí) a 780 g, doprava
// se počítá ze skutečné hmotnosti.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { cartWeight, coldShippingPrice } from "../shippingRates";

const ROOT = path.join(__dirname, "../../..");
const read = (dir: string, f: string) => readFileSync(path.join(ROOT, dir, f), "utf8");
const script = read("docs/eshop-production", "101_sirupy_hmotnosti_MAIN.sql").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);

describe("101 hmotnosti sirupů", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql"]) await pg.exec(read("docs/eshop-catalog", f));
    await pg.query(`UPDATE product_variants SET weight_g = CASE WHEN volume_ml = 3000 THEN 3000 WHEN volume_ml = 650 THEN 750 ELSE weight_g END`);
  }, 120_000);

  it("14 balení sirupů dostane skutečnou hmotnost, nic jiného se nezmění; druhé spuštění zastaví", async () => {
    const q = `SELECT v.sku, v.label, v.volume_ml, v.price_b2c_kc, v.weight_g, c.slug AS cat FROM product_variants v
      JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id ORDER BY v.sku`;
    type Row = { sku: string; label: string; volume_ml: number; price_b2c_kc: number; weight_g: number; cat: string };
    const before = (await pg.query<Row>(q)).rows;
    await pg.exec(script);
    const after = (await pg.query<Row>(q)).rows;
    let changed = 0;
    after.forEach((r, i) => {
      if (r.cat === "sirupy") {
        changed++;
        expect(r.weight_g).toBe(r.volume_ml === 3000 ? 3800 : 780);
        expect({ ...r, weight_g: 0 }).toEqual({ ...before[i], weight_g: 0 });
      } else expect(r).toEqual(before[i]);
    });
    expect(changed).toBe(14);
    await expect(pg.exec(script)).rejects.toThrow(/Čekal jsem 7 balení/);
    await pg.exec("ROLLBACK");
  });

  it("doprava ze skutečné hmotnosti: 3 sirupy 11,4 kg → 267 Kč, 4 → 15,2 kg → 379 Kč, 5 → 19 kg → 379 Kč, 6 → 22,8 kg → 491 Kč", () => {
    const price = (n: number) => {
      const w = cartWeight([{ sku: "lipovy-sirup-3l", quantity: n, weightGrams: 3800 }]);
      const p = w.ok ? coldShippingPrice(w.grams) : null;
      return [w.ok && w.grams, p?.ok && p.priceKc];
    };
    expect(price(3)).toEqual([11_400, 267]);
    expect(price(4)).toEqual([15_200, 379]);
    expect(price(5)).toEqual([19_000, 379]);
    expect(price(6)).toEqual([22_800, 491]);
  });
});
