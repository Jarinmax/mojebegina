// Skript 87 (Svařák Deluxe, Lady Carneval) nad PGlite se stavem jako
// v Production 10. 11. 2026 + přípravu a vrácení z kódu.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { loadCatalog } from "../catalogDb";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/87_koktejly_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const STOR_OLD = "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.";

describe("87 koktejly", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    const has = (await pg.query(`SELECT slug FROM products WHERE slug IN ('svarak-deluxe','lady-carneval','granatovy-bond','kosmopolitan')`)).rows.length;
    expect(has).toBe(4);
    await pg.query(`UPDATE products SET storage_instructions = $1, shelf_life_note = NULL WHERE slug IN ('svarak-deluxe','lady-carneval','granatovy-bond','kosmopolitan')`, [STOR_OLD]);
    await pg.query(`UPDATE products SET ingredients = $1, alcohol_percent = 6.3, allergens = NULL, warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.'] WHERE slug = 'kosmopolitan'`, [
      "čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    ]);
    await pg.query(`UPDATE products SET ingredients = $1, alcohol_percent = 6.7, warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.'] WHERE slug = 'granatovy-bond'`, [
      "čistá filtrovaná voda, vodka, šťáva z granátového jablka, třtinový cukr, citronová šťáva, antioxidant: kyselina askorbová (vitamin C)",
    ]);
    await pg.query(`UPDATE products SET ingredients = $1, alcohol_percent = 7.2, warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.', 'E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.'] WHERE slug = 'lady-carneval'`, [
      "čistá filtrovaná voda, vodka, grepová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E110, E124), citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)",
    ]);
  }, 120_000);

  it("změní jen zadané údaje, ostatní produkty beze změny", async () => {
    const others = (await pg.query(`SELECT slug, ingredients, storage_instructions, shelf_life_note, warnings FROM products WHERE slug NOT IN ('svarak-deluxe','lady-carneval','granatovy-bond','kosmopolitan') ORDER BY slug`)).rows;
    const svarakBefore = (await pg.query(`SELECT ingredients, allergens, alcohol_percent, nutrition, warnings FROM products WHERE slug = 'svarak-deluxe'`)).rows;
    await pg.exec(script);
    const list = (await loadCatalog(db)).products;
    const svarak = list.find((p) => p.slug === "svarak-deluxe")!;
    const lady = list.find((p) => p.slug === "lady-carneval")!;
    for (const p of [svarak, lady]) {
      expect(p.foodInfo.storage).toBe("Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.");
      expect(p.foodInfo.shelfLife).toBe("Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte co nejdříve při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.");
      expect(p.foodInfo.returns?.linkText).toBe("obchodních podmínkách");
    }
    expect(svarak.foodInfo.preparation).toMatch(/^Před podáváním šetrně ohřejte\. Nepřivádějte k varu\./);
    expect(lady.foodInfo.preparation).toBe("Podávejte vychlazené, případně s ledem. Nápoj je připravený k podávání, neředí se.");
    expect(lady.foodInfo.ingredients).toMatch(/grapefruitová šťáva, Aperol \(pitná voda, cukr, líh, aromata, barviva: E 110, E 124\)/);
    expect(lady.warnings).toEqual(["Není určeno pro děti, těhotné a kojící ženy."]);
    expect(lady.alcoholPercent).toBe(7.2);
    const gb = list.find((p) => p.slug === "granatovy-bond")!;
    expect(gb.foodInfo.ingredients).toMatch(/^čistá filtrovaná voda, šťáva z granátového jablka, vodka, /);
    expect(gb.alcoholPercent).toBe(6.3);
    expect(gb.foodInfo.preparation).toBe(lady.foodInfo.preparation);
    expect(gb.foodInfo.storage).toBe(lady.foodInfo.storage);
    expect(gb.warnings).toEqual(["Není určeno pro děti, těhotné a kojící ženy."]);
    expect((await pg.query(`SELECT ingredients, allergens, alcohol_percent, nutrition, warnings FROM products WHERE slug = 'svarak-deluxe'`)).rows).toEqual(svarakBefore);
    expect((await pg.query(`SELECT slug, ingredients, storage_instructions, shelf_life_note, warnings FROM products WHERE slug NOT IN ('svarak-deluxe','lady-carneval','granatovy-bond','kosmopolitan') ORDER BY slug`)).rows).toEqual(others);
    const k = list.find((p) => p.slug === "kosmopolitan")!;
    expect(k.foodInfo.storage).toBe(lady.foodInfo.storage);
    expect(k.foodInfo.preparation).toBe(lady.foodInfo.preparation);
    expect(k.foodInfo.allergens).toBeNull(); // blokace (BEG-02) zůstává
    expect(k.alcoholPercent).toBe(6.3);
    await expect(pg.exec(script)).rejects.toThrow(/nemá očekávané původní/);
    await pg.exec("ROLLBACK");
  });
});
