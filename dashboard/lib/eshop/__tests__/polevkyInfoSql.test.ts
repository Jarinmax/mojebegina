// Skripty 76 (bez samostatné kyseliny citronové, 19 produktů) a 77 (polévky:
// skladování a trvanlivost) nad PGlite se stavem jako v Production 9. 11.
// 2026; vrácení/reklamace a příprava se u polévek zobrazí podle šablony.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { SOUP_SHELF_LIFE, SOUP_STORAGE } from "../soupFoodInfo";

const ROOT = path.join(__dirname, "../../..");
const script = (name: string) =>
  readFileSync(path.join(ROOT, "docs/eshop-production", name), "utf8").replace("IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'", "IS NOT NULL AND false");
const catalog = (name: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", name), "utf8");
const OLD_STORAGE =
  "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena.";
const SHELF_77 =
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při skladování do 4 °C, nejpozději však do data ‚Spotřebujte do‘ uvedeného na obalu.";
const OLD_SHELF = "Do 14 dnů při zachování správného uskladnění (do 4 °C).";

describe("76 + 77 nad stavem Production", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "71_ovocne_napoje.sql"]) await pg.exec(catalog(f));
    // stav Production: 19 aktivních produktů se samostatnou kyselinou citronovou, polévky se starými texty
    await pg.query(`UPDATE products SET is_active = true WHERE slug IN ('cervankove-nebe','dum-u-jezera','malinovy-svarak-nealko')`);
    // Tomatová v tehdejším zápisu (bez podsložek pasírovaných rajčat — kyselina citronová v nich přibyla až skriptem 86)
    await pg.query(`UPDATE products SET ingredients = replace(replace(ingredients, ' (rajčata 99,9 %, regulátor kyselosti: kyselina citronová)', ''), ' (rajčatový protlak, jedlá sůl 1 %)', '') WHERE slug = 'rajcatova-polevka'`);
    await pg.query(`UPDATE products SET ingredients = ingredients || ', regulátor kyselosti: kyselina citronová, antioxidant: E300' WHERE is_active AND slug IN (SELECT p.slug FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug IN ('polevky','caje','ovocne-napoje') AND p.slug <> 'gulasova-polevka-z-hlivy-ustricne')`);
    await pg.query(`UPDATE products SET ingredients = ingredients || '; regulátor kyselosti: kyselina citronová; x' WHERE slug IN (SELECT slug FROM products WHERE is_active AND ingredients NOT LIKE '%regulátor%' AND slug IN ('granatovy-bond','kosmopolitan','lady-carneval'))`);
    await pg.query(`UPDATE products p SET storage_instructions = $1, shelf_life_note = $2 FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'polevky'`, [OLD_STORAGE, OLD_SHELF]);
  }, 120_000);

  it("77: všech 6 polévek má nové skladování a trvanlivost, jiné kategorie beze změny", async () => {
    const teaBefore = (await pg.query<{ s: string }>(`SELECT storage_instructions s FROM products WHERE slug = 'lipovy-caj'`)).rows[0].s;
    await pg.exec(script("77_polevky_skladovani_trvanlivost_MAIN.sql"));
    const rows = (await pg.query<{ s: string; t: string }>(`SELECT p.storage_instructions s, p.shelf_life_note t FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'polevky'`)).rows;
    expect(rows).toHaveLength(6);
    // skript 77 zapsal tehdejší znění; od 10. 11. 2026 platí SOUP_SHELF_LIFE (skript 82)
    for (const r of rows) expect(r).toEqual({ s: SOUP_STORAGE, t: SHELF_77 });
    await pg.exec(readFileSync(path.join(ROOT, "docs/eshop-production/82_polevky_trvanlivost_MAIN.sql"), "utf8").replace("IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'", "IS NOT NULL AND false"));
    const after82 = (await pg.query<{ s: string; t: string }>(`SELECT p.storage_instructions s, p.shelf_life_note t FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'polevky'`)).rows;
    for (const r of after82) expect(r).toEqual({ s: SOUP_STORAGE, t: SOUP_SHELF_LIFE });
    expect((await pg.query<{ s: string }>(`SELECT storage_instructions s FROM products WHERE slug = 'lipovy-caj'`)).rows[0].s).toBe(teaBefore);
  });

  it("76: samostatná kyselina citronová pryč (počet podle stavu), zbytek složení beze změny", async () => {
    const count = Number((await pg.query<{ n: number }>(`SELECT count(*) n FROM products WHERE is_active AND ingredients ~ 'regulátor kyselosti: kyselina citronová[,;] '`)).rows[0].n);
    // v testovací DB nemusí být přesně 19 — pojistka na počet se nastaví podle stavu
    await pg.exec(script("76_bez_kyseliny_citronove_MAIN.sql").replace("IF n <> 19 THEN", `IF n <> ${count} THEN`));
    const left = (await pg.query(`SELECT 1 FROM products WHERE is_active AND ingredients ILIKE '%kyselina citronová%'`)).rows;
    expect(left).toEqual([]);
    const dyne = (await pg.query<{ i: string }>(`SELECT ingredients i FROM products WHERE slug = 'dynova-polevka'`)).rows[0].i;
    expect(dyne).toMatch(/^čistá filtrovaná voda, dýně 39 %/);
    expect(dyne).toMatch(/antioxidant: kyselina askorbová/);
    await expect(pg.exec(script("76_bez_kyseliny_citronove_MAIN.sql"))).rejects.toThrow(/Čekal jsem 19 produktů/);
    await pg.exec("ROLLBACK");
  });
});
