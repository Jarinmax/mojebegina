// Zásilkovna pro kapsičky sirupů (13. 11. 2026) + skript 102 (kapsička 805 g).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { cartWeight, coldShippingPrice } from "../shippingRates";
import { ZASILKOVNA_MAX_POUCHES, isSyrupPouch, quoteZasilkovna } from "../zasilkovna";

const pouch = (quantity: number, weightGrams: number | null = 805) => ({
  quantity,
  product: { category: "sirupy" },
  variant: { volumeMl: 650, weightGrams },
});
const big = { quantity: 1, product: { category: "sirupy" }, variant: { volumeMl: 3000, weightGrams: 3826 } };
const soup = { quantity: 1, product: { category: "polevky" }, variant: { volumeMl: 3000, weightGrams: 3000 } };

describe("Zásilkovna — pravidla", () => {
  it("jen sirup v kapsičce 650 ml", () => {
    expect(isSyrupPouch({ category: "sirupy" }, { volumeMl: 650 })).toBe(true);
    expect(isSyrupPouch({ category: "sirupy" }, { volumeMl: 3000 })).toBe(false);
    expect(isSyrupPouch({ category: "koktejly" }, { volumeMl: 500 })).toBe(false);
  });

  it("1–4 kapsičky: 104 Kč (89 + krabice 15), hmotnost = kapsičky × 805 g + krabice 73 g", () => {
    expect(quoteZasilkovna([pouch(1)])).toEqual({ available: true, priceKc: 104, weightGrams: 878, pouches: 1 });
    expect(quoteZasilkovna([pouch(2)])).toMatchObject({ priceKc: 104, weightGrams: 1683 });
    expect(quoteZasilkovna([pouch(1), pouch(2)])).toMatchObject({ priceKc: 104, weightGrams: 2488, pouches: 3 });
    expect(quoteZasilkovna([pouch(4)])).toMatchObject({ priceKc: 104, weightGrams: 3293 });
  });

  it("5 a víc kapsiček zatím ne — větší krabice není koupená ani zvážená", () => {
    expect(ZASILKOVNA_MAX_POUCHES).toBe(4);
    expect(quoteZasilkovna([pouch(5)])).toEqual({ available: false, reason: "too_many" });
    expect(quoteZasilkovna([pouch(3), pouch(3)])).toEqual({ available: false, reason: "too_many" });
  });

  it("jakékoli jiné zboží v košíku Zásilkovnu vypne", () => {
    expect(quoteZasilkovna([pouch(1), big])).toEqual({ available: false, reason: "other_goods" });
    expect(quoteZasilkovna([pouch(1), soup])).toEqual({ available: false, reason: "other_goods" });
    expect(quoteZasilkovna([])).toEqual({ available: false, reason: "empty" });
  });

  it("bez známé hmotnosti se cena nehádá", () => {
    expect(quoteZasilkovna([pouch(2, null)])).toEqual({ available: false, reason: "missing_weight" });
  });
});

const ROOT = path.join(__dirname, "../../..");
const read = (dir: string, f: string) => readFileSync(path.join(ROOT, dir, f), "utf8");
const script = read("docs/eshop-production", "102_sirupy_650ml_hmotnost_MAIN.sql").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);

describe("102 hmotnost kapsičky 650 ml", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql"]) await pg.exec(read("docs/eshop-catalog", f));
    // stav Production po skriptu 101
    await pg.query(`UPDATE product_variants v SET weight_g = CASE
        WHEN c.slug = 'sirupy' AND v.volume_ml = 3000 THEN 3826
        WHEN c.slug = 'sirupy' AND v.volume_ml = 650 THEN 780
        WHEN v.volume_ml = 3000 THEN 3000 ELSE v.weight_g END
      FROM products p JOIN product_categories c ON c.id = p.category_id WHERE p.id = v.product_id`);
  }, 120_000);

  it("7 kapsiček 780 → 805 g, nic jiného se nezmění; druhé spuštění zastaví", async () => {
    const q = `SELECT v.sku, v.label, v.volume_ml, v.price_b2c_kc, v.weight_g, c.slug AS cat FROM product_variants v
      JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id ORDER BY v.sku`;
    type Row = { sku: string; label: string; volume_ml: number; price_b2c_kc: number; weight_g: number; cat: string };
    const before = (await pg.query<Row>(q)).rows;
    await pg.exec(script);
    const after = (await pg.query<Row>(q)).rows;
    let changed = 0;
    after.forEach((r, i) => {
      if (r.cat === "sirupy" && r.volume_ml === 650) {
        changed++;
        expect(before[i].weight_g).toBe(780);
        expect(r.weight_g).toBe(805);
        expect({ ...r, weight_g: 0 }).toEqual({ ...before[i], weight_g: 0 });
      } else expect(r).toEqual(before[i]);
    });
    expect(changed).toBe(7);
    await expect(pg.exec(script)).rejects.toThrow(/Čekal jsem 7 kapsiček/);
    await pg.exec("ROLLBACK");
  });

  it("chlazená přeprava se nemění: 18 kapsiček = 14,49 kg, pořád první pásmo 267 Kč", () => {
    const w = cartWeight([{ sku: "lipovy-sirup-750ml", quantity: 18, weightGrams: 805 }]);
    expect(w.ok && w.grams).toBe(14_490);
    const p = w.ok ? coldShippingPrice(w.grams) : null;
    expect(p?.ok && p.priceKc).toBe(267);
  });
});
