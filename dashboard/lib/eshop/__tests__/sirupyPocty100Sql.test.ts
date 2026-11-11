// Skript 100 (sirupy: počty nápojů podle balení) nad PGlite ve stavu před ním.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/100_sirupy_pocty_napoju_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const catalog = (f: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", f), "utf8");
const OLD_RULE = "Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.";
const NEW_RULE = "Použijte přibližně **20 ml sirupu a doplňte vodou na 200 ml nápoje**. Chuť si můžete upravit podle sebe.";

describe("100 sirupy počty nápojů", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    for (const f of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "71_ovocne_napoje.sql"]) await pg.exec(catalog(f));
    // stav Production před skriptem
    await pg.query(`UPDATE products p SET
        short_description = 'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na '
          || substring(p.short_description FROM 'cca ([0-9],[0-9]{2}) Kč') || ' Kč.',
        highlights = array_replace(p.highlights, 'až 150 nápojů z balení 3 l', 'až 150 nápojů z jednoho balení'),
        description = array_replace(p.description, $1, $2)
      FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'sirupy'`, [NEW_RULE, OLD_RULE]);
  }, 120_000);

  it("generátor má nové texty u všech 7 sirupů", () => {
    const sql = catalog("31_sirupy.sql");
    expect(sql.match(/650 ml: až 32 nápojů/g)).toHaveLength(7);
    expect(sql).not.toContain("z jednoho balení");
    expect(sql).not.toContain("20 ml sirupu na 200 ml vody");
  });

  it("přepíše 7 sirupů, nic jiného; druhé spuštění zastaví", async () => {
    const others = `SELECT slug, short_description, description, highlights, ingredients, nutrition FROM products p
      JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'sirupy' ORDER BY slug`;
    const before = (await pg.query(others)).rows;
    await pg.exec(script);
    const rows = (await pg.query<{ slug: string; short_description: string; highlights: string[]; description: string[] }>(
      `SELECT p.slug, p.short_description, p.highlights, p.description FROM products p
        JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'sirupy' ORDER BY p.slug`)).rows;
    expect(rows).toHaveLength(7);
    for (const r of rows) {
      expect(r.short_description).toMatch(/^3 l: až 150 nápojů \(cca [0-9],[0-9]{2} Kč za nápoj\)\. 650 ml: až 32 nápojů\. Při ředění 1 : 10\.$/);
      expect(r.highlights).toContain("až 150 nápojů z balení 3 l");
      expect(r.description).toContain(NEW_RULE);
    }
    expect(rows.find((r) => r.slug === "bylinny-sirup-saman")!.short_description).toContain("cca 3,70 Kč");
    expect(rows.find((r) => r.slug === "zazvorovy-sirup")!.short_description).toContain("cca 3,30 Kč");
    expect((await pg.query(others)).rows).toEqual(before);
    await expect(pg.exec(script)).rejects.toThrow(/Čekal jsem 7 sirupů/);
    await pg.exec("ROLLBACK");
  });
});
