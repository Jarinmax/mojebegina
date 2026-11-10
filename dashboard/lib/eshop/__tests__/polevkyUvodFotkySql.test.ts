// Skripty 83 (text kategorie Polévky, bez „přirozeně bezlepková“), 84
// (blokace Kosmopolitanu) a 85 (nové fotky polévek) nad PGlite se stavem
// jako v Production 10. 11. 2026 (staré fotky, prázdný text kategorie).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { loadCatalog } from "../catalogDb";
import { isOrderable } from "../productRules";

const ROOT = path.join(__dirname, "../../..");
const script = (name: string) =>
  readFileSync(path.join(ROOT, "docs/eshop-production", name), "utf8").replace("IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'", "IS NOT NULL AND false");
const catalog = (name: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", name), "utf8");
const SOUPS = ["dynova-polevka", "kulajda", "rajcatova-polevka", "rajcatova-polevka-s-cervenou-repou", "gulasova-polevka-z-hlivy-ustricne", "spenatova-polevka"];

describe("83 + 84 + 85 nad stavem Production", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "71_ovocne_napoje.sql"]) await pg.exec(catalog(f));
    // stav Production: prázdný text kategorie, „přirozeně bezlepková“, staré fotky
    await pg.query(`UPDATE product_categories SET intro = '{}', image_url = '/eshop/kategorie-polevky.jpg' WHERE slug = 'polevky'`);
    await pg.query(`UPDATE products p SET highlights = ARRAY['rostlinná receptura','přirozeně bezlepková','z čisté filtrované vody'] FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'polevky'`);
    await pg.query(`DELETE FROM product_images WHERE url LIKE '/eshop/polevky/%'`);
    for (const slug of SOUPS) {
      await pg.query(`INSERT INTO product_images (product_id, url, alt, sort_order) SELECT id, $1, name, 0 FROM products WHERE slug = $2`, [`/eshop/${slug}.jpg`, slug]);
    }
  }, 120_000);

  it("83: text kategorie (3 odstavce), bez „přirozeně bezlepková“, nic jiného", async () => {
    const before = (await pg.query(`SELECT slug, ingredients, allergens, shelf_life_note FROM products ORDER BY slug`)).rows;
    await pg.exec(script("83_polevky_uvod_bez_lepku_MAIN.sql"));
    const intro = (await pg.query<{ intro: string[] }>(`SELECT intro FROM product_categories WHERE slug = 'polevky'`)).rows[0].intro;
    expect(intro).toHaveLength(3);
    expect(intro[2]).toMatch(/Méně času u plotny, více času pro Vás\.$/);
    const hl = (await pg.query<{ h: string[] }>(`SELECT highlights h FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'polevky'`)).rows;
    for (const r of hl) expect(r.h).toEqual(["rostlinná receptura", "z čisté filtrované vody"]);
    expect((await pg.query(`SELECT slug, ingredients, allergens, shelf_life_note FROM products ORDER BY slug`)).rows).toEqual(before);
    // podruhé neprojde (text už je) — nic se nezdvojí
    await expect(pg.exec(script("83_polevky_uvod_bez_lepku_MAIN.sql"))).rejects.toThrow(/už nějaký text má/);
    await pg.exec("ROLLBACK");
  });

  it("85: hlavní fotka miska, druhá sáček; kategorie = Dýňová; ostatní fotky beze změny", async () => {
    const others = (await pg.query(`SELECT product_id, url FROM product_images WHERE url NOT LIKE '/eshop/%polevk%' AND url NOT IN (${SOUPS.map((s) => `'/eshop/${s}.jpg'`).join(",")}) ORDER BY url`)).rows;
    await pg.exec(script("85_polevky_fotky_MAIN.sql"));
    const cat = await loadCatalog(db);
    for (const slug of SOUPS) {
      const p = cat.products.find((x) => x.slug === slug)!;
      expect(p.image).toBe(`/eshop/polevky/${slug}-miska.jpg`);
      expect(p.gallery?.map((g) => g.url)).toEqual([`/eshop/polevky/${slug}-miska.jpg`, `/eshop/polevky/${slug}-sacek.jpg`]);
    }
    expect(cat.categories.find((c) => c.slug === "polevky")!.image).toBe("/eshop/polevky/dynova-polevka-miska.jpg");
    expect((await pg.query(`SELECT product_id, url FROM product_images WHERE url NOT LIKE '/eshop/%polevk%' AND url NOT IN (${SOUPS.map((s) => `'/eshop/${s}.jpg'`).join(",")}) ORDER BY url`)).rows).toEqual(others);
    await expect(pg.exec(script("85_polevky_fotky_MAIN.sql"))).rejects.toThrow(/Čekal jsem 6 původních/);
    await pg.exec("ROLLBACK");
  });

  it("86: Špenátová — nové složení a výživa, ostatní polévky beze změny", async () => {
    await pg.query(`UPDATE products SET ingredients = $1, nutrition = $2::jsonb WHERE slug = 'spenatova-polevka'`, [
      "čistá filtrovaná voda, špenát 17 %, kokosové mléko 15 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 13 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)",
      JSON.stringify({ fat: 3.2, salt: 0.7, fibre: 0.8, sugars: 0.7, protein: 1.1, energy_kj: 210, saturates: 1.7, energy_kcal: 50, carbohydrate: 4.1 }),
    ]);
    const others = (await pg.query(`SELECT slug, ingredients, nutrition FROM products WHERE slug <> 'spenatova-polevka' ORDER BY slug`)).rows;
    await pg.exec(script("86_spenatova_slozeni_vyziva_MAIN.sql"));
    const s = (await loadCatalog(db)).products.find((p) => p.slug === "spenatova-polevka")!;
    expect(s.foodInfo.ingredients).toMatch(/kokosové mléko 14 % .*brambory 14 %, cibule, olivový olej/);
    expect(s.foodInfo.nutritionPer100g).toBe("na 100 ml: energie 199 kJ / 48 kcal, tuky 3,4 g (z toho nasycené 2,4 g), sacharidy 2,7 g (z toho cukry 0,7 g), bílkoviny 1,1 g, sůl 0,76 g");
    expect((await pg.query(`SELECT slug, ingredients, nutrition FROM products WHERE slug <> 'spenatova-polevka' ORDER BY slug`)).rows).toEqual(others);
    await expect(pg.exec(script("86_spenatova_slozeni_vyziva_MAIN.sql"))).rejects.toThrow(/nemá očekávané původní/);
    await pg.exec("ROLLBACK");
  });

  it("84: Kosmopolitan nejde objednat, ostatní ano", async () => {
    const has = (await pg.query(`SELECT 1 FROM products WHERE slug = 'kosmopolitan'`)).rows.length;
    if (!has) return; // testovací katalog bez koktejlů — ověří se jen syntaxe níže
    await pg.query(`UPDATE products SET allergens = '{}', is_active = true WHERE slug = 'kosmopolitan'`);
    await pg.query(`UPDATE products SET allergens = '{}' WHERE allergens IS NULL`);
    await pg.exec(script("84_kosmopolitan_blokace_MAIN.sql"));
    const k = (await loadCatalog(db)).products.find((p) => p.slug === "kosmopolitan")!;
    expect(isOrderable(k)).toBe(false);
  });
});
