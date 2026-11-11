// Skript 81 (označení „3 l“, popisy balení, Zlaté pravidlo u sirupů) nad
// PGlite se stavem jako v Production 9. 11. 2026 (večer).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { packagingSentence } from "../packaging";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/81_baleni_3l_popisy_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const catalog = (f: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", f), "utf8");
const OLD3 = "Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.";

describe("81 balení nad stavem Production", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "71_ovocne_napoje.sql"]) await pg.exec(catalog(f));
    // stav Production: „Begina 3 l“ (sirupy už „3 l“), staré popisy, sirupy bez Zlatého pravidla
    await pg.query(`UPDATE product_variants SET label = 'Begina 3 l', package_description = $1 WHERE label = '3 l' AND sku NOT LIKE '%sirup%'`, [OLD3]);
    await pg.query(`UPDATE product_variants SET package_description = $1 WHERE label = '3 l'`, [OLD3]);
    await pg.query(`UPDATE product_variants SET label = '700 ml', volume_ml = 700, servings = 35, short_note = 'Až 35 nápojů', package_description = 'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.' WHERE sku LIKE '%sirup%-750ml'`);
    await pg.query(`UPDATE products p SET description = ARRAY(SELECT d FROM unnest(description) d WHERE d NOT LIKE '%Zlaté pravidlo%' AND d NOT LIKE '%20 ml sirupu%')
      FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'sirupy'`);
  }, 120_000);

  it("3 l všude, popisy podle packaging.ts, Zlaté pravidlo zpět; hmotnosti a ceny beze změny; druhé spuštění zastaví", async () => {
    const keep = (await pg.query(`SELECT sku, weight_g, price_b2c_kc, volume_ml FROM product_variants ORDER BY sku`)).rows;
    await pg.exec(script);
    const rows = (await pg.query<{ cat: string; label: string; pd: string }>(`SELECT c.slug cat, v.label, v.package_description pd FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id`)).rows;
    expect(rows.some((r) => r.label === "Begina 3 l")).toBe(false);
    for (const r of rows) if (packagingSentence(r.cat, r.label)) expect(r.pd, `${r.cat} ${r.label}`).toBe(packagingSentence(r.cat, r.label));
    expect(rows.filter((r) => r.cat === "sirupy" && r.label === "3 l").every((r) => r.pd.endsWith("Dodáváme v kartonové krabici."))).toBe(true);
    expect(rows.filter((r) => r.cat === "polevky").every((r) => !r.pd.includes("kartonové"))).toBe(true);
    const syrups = (await pg.query<{ d: string[] }>(`SELECT description d FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'sirupy'`)).rows;
    expect(syrups).toHaveLength(7);
    for (const s of syrups) expect(s.d.slice(-2)).toEqual([
      "**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.",
      "Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.",
    ]);
    expect((await pg.query(`SELECT sku, weight_g, price_b2c_kc, volume_ml FROM product_variants ORDER BY sku`)).rows).toEqual(keep);
    await expect(pg.exec(script)).rejects.toThrow(/Žádné „Begina 3 l“/);
    await pg.exec("ROLLBACK");
  });
});
