// Skript 78 (kokosové mléko: kokosový extrakt 85 %, pitná voda, emulgátor:
// E 435) nad PGlite se stavem jako v Production 9. 11. 2026 (původní zápis
// včetně odlišného pořadí u špenátové polévky).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "docs/eshop-production/78_kokosove_mleko_85_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const catalog = readFileSync(path.join(ROOT, "docs/eshop-catalog/41_polevky.sql"), "utf8");
const NEW = "(kokosový extrakt 85 %, pitná voda, emulgátor: E 435)";
const OLD = "(kokosový extrakt 70 %, voda, emulgátor E435)";
const OLD_SPENAT = "(70 % kokosový extrakt, voda, emulgátor E435)";

describe("78 kokosové mléko nad stavem Production", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let before: Record<string, string>;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    await pg.exec(catalog);
    // vrátit původní zápis jako v Production
    await pg.query(`UPDATE products SET ingredients = replace(ingredients, $1, $2) WHERE slug <> 'spenatova-polevka'`, [NEW, OLD]);
    await pg.query(`UPDATE products SET ingredients = replace(ingredients, $1, $2) WHERE slug = 'spenatova-polevka'`, [NEW, OLD_SPENAT]);
    before = Object.fromEntries((await pg.query<{ slug: string; i: string }>(`SELECT slug, ingredients i FROM products`)).rows.map((r) => [r.slug, r.i]));
  }, 120_000);

  it("generátor katalogu už má nový zápis u 5 polévek", () => {
    expect(catalog.split(NEW).length - 1).toBe(5);
    expect(catalog).not.toMatch(/extrakt 70|E435/);
  });

  it("opraví 5 produktů, jinak složení beze změny; druhé spuštění zastaví", async () => {
    await pg.exec(script);
    const rows = (await pg.query<{ slug: string; i: string }>(`SELECT slug, ingredients i FROM products`)).rows;
    const changed = rows.filter((r) => r.i !== before[r.slug]).map((r) => r.slug).sort();
    expect(changed).toEqual(["dynova-polevka", "kulajda", "rajcatova-polevka", "rajcatova-polevka-s-cervenou-repou", "spenatova-polevka"]);
    for (const r of rows) {
      if (!changed.includes(r.slug)) continue;
      expect(r.i).toContain(NEW);
      expect(r.i.replace(NEW, OLD)).toBe(before[r.slug].replace(OLD_SPENAT, OLD));
    }
    const dyne = rows.find((r) => r.slug === "dynova-polevka")!.i;
    expect(dyne).toContain(`kokosové mléko 14 % ${NEW}, brambory 10 %`);
    expect(rows.find((r) => r.slug === "rajcatova-polevka")!.i).toContain(`kokosové mléko 6 % ${NEW}`);
    await expect(pg.exec(script)).rejects.toThrow(/Čekal jsem 5 produktů/);
    await pg.exec("ROLLBACK");
  });
});
