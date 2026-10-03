// ESHOP 1.0 — katalogový skript Bylinné sirupy (docs/eshop-catalog/3x_*)
// nad PGlite se všemi migracemi: přesně ty soubory, které vedení spustí
// v Neon SQL Editoru (Preview, později Production).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createMigratedDb } from "./helpers/migratedDb";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-catalog");
const PUBLIC = path.join(__dirname, "../../../public");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

const SYRUPS = [
  ["Bylinný sirup Šaman", 549],
  ["Zázvorový sirup", 499],
  ["Lipový sirup", 549],
  ["Ibiškový sirup", 499],
  ["Šípkový sirup", 499],
  ["Heřmánkový sirup", 549],
  ["Meduňkový sirup s levandulí", 549],
] as const;

describe("katalog — Bylinné sirupy", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
  });

  it("před: kategorie bez textu a bez sirupů", async () => {
    expect(await check(pg, "30_sirupy_before.sql")).toBe("1 | 0 | 0 | 0 | 0 | 7 | 11");
  });

  it("skript: 7 sirupů, 14 balení, 7 fotek; po kontrole přesně podle komentáře", async () => {
    await pg.exec(file("31_sirupy.sql"));
    expect(await check(pg, "32_sirupy_after.sql")).toBe("3 | 7 | 7 | 14 | 7 | 7 | 3 | 4 | 14 | 25");
  });

  it("opakované spuštění nic nezdvojí", async () => {
    await pg.exec(file("31_sirupy.sql"));
    expect(await check(pg, "32_sirupy_after.sql")).toBe("3 | 7 | 7 | 14 | 7 | 7 | 3 | 4 | 14 | 25");
  });

  it("e-shop: sirupy v pořadí z begina.cz, 3 l a 750 ml, fotky existují; text kategorie", async () => {
    const catalog = await loadCatalog(db);
    const syrups = catalog.products.filter((p) => p.category === "sirupy");
    expect(syrups.map((p) => [p.name, p.variants.map((v) => [v.label, v.detail, v.priceKc])])).toEqual(
      SYRUPS.map(([name, price3l]) => [
        name,
        [
          ["3 l Rodinná zásoba (bag-in-box)", "Až 150 nápojů", price3l],
          ["750 ml Praktické balení", "Až 37 nápojů", 199],
        ],
      ])
    );
    for (const product of syrups) {
      expect(product.image, product.slug).toBe(`/eshop/${product.slug}.jpg`);
      expect(existsSync(path.join(PUBLIC, product.image!)), product.image!).toBe(true);
    }
    const saman = syrups[0];
    expect(saman.highlights).toEqual(["40 % bylinného výluhu", "z čisté filtrované vody", "bez umělých aromat a barviv", "až 150 nápojů z jednoho balení"]);
    expect(saman.description).toHaveLength(3);
    expect(saman.shortDescription).toMatch(/přibližně na 3,70 Kč\.$/);
    // Složení apod. nedodáno → na stránce „Doplníme“, nic vymyšleného.
    expect(syrups.every((p) => p.foodInfo.ingredients === null && p.foodInfo.allergens === null)).toBe(true);
    expect(syrups.slice(1).every((p) => p.description.length === 0 && p.highlights.length === 0)).toBe(true);
    const category = catalog.categories.find((c) => c.slug === "sirupy")!;
    expect(category.intro[0]).toMatch(/^Bylinné sirupy Begina připravujeme řemeslně/);
    expect(category.intro[2]).toMatch(/zlaté pravidlo ředění 1:10/);
    // ostatní katalog beze změny
    expect(catalog.products.filter((p) => p.category !== "sirupy")).toHaveLength(7);
  });

  it("vrácení: sirupy z e-shopu zmizí, nic se nesmaže; nové spuštění je vrátí", async () => {
    await pg.exec(file("39_sirupy_rollback.sql"));
    let catalog = await loadCatalog(db);
    expect(catalog.products.filter((p) => p.category === "sirupy")).toHaveLength(0);
    expect(catalog.categories.find((c) => c.slug === "sirupy")!.intro).toEqual([]);
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM products WHERE slug LIKE '%sirup%'`);
    expect(rows[0].n).toBe(7);
    await pg.exec(file("31_sirupy.sql"));
    catalog = await loadCatalog(db);
    expect(catalog.products.filter((p) => p.category === "sirupy")).toHaveLength(7);
  });
});
