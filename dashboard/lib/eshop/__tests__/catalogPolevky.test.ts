// ESHOP 1.0 — katalogový skript Čerstvé polévky (docs/eshop-catalog/4x_*)
// nad PGlite se všemi migracemi: přesně ty soubory, které vedení spustí
// v Neon SQL Editoru (Preview, později Production).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { parseDescription } from "../productDescription";
import { expectedCatalogAfterSeed } from "../seedFromCatalog";
import { createMigratedDb } from "./helpers/migratedDb";
import { polevkyRollbackSql, polevkySql } from "../../../scripts/eshop-catalog/build-polevky.mjs";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-catalog");
const PUBLIC = path.join(__dirname, "../../../public");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

describe("katalog — Čerstvé polévky: soubory", () => {
  it("41 a 49 = výstup generátoru (scripts/eshop-catalog/build-polevky.mjs)", () => {
    expect(file("41_polevky.sql")).toBe(polevkySql());
    expect(file("49_polevky_rollback.sql")).toBe(polevkyRollbackSql());
  });
});

describe("katalog — Čerstvé polévky", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const soups = async () => (await loadCatalog(db)).products.filter((p) => p.category === "polevky");

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
  });

  it("před: polévky ze základního katalogu", async () => {
    expect(await check(pg, "40_polevky_before.sql")).toBe("3 | 0 | Krémová polévka z dýně. | (bez názvu) | 379 | 0");
  });

  it("skript a kontrola po; opakované spuštění nic nezdvojí", async () => {
    await pg.exec(file("41_polevky.sql"));
    expect(await check(pg, "42_polevky_after.sql")).toBe("3 | 1 | ano | 3 l Rodinná zásoba (bag-in-box) | 379 | 12 | 1 | 1");
    await pg.exec(file("41_polevky.sql"));
    expect(await check(pg, "42_polevky_after.sql")).toBe("3 | 1 | ano | 3 l Rodinná zásoba (bag-in-box) | 379 | 12 | 1 | 1");
  });

  it("e-shop: Dýňová polévka z begina.cz (vláknina, sekce Pro koho, fotka); ostatní polévky beze změny", async () => {
    const list = await soups();
    expect(list.map((p) => p.name)).toEqual(["Dýňová polévka", "Kulajda", "Rajčatová polévka"]);
    const dyne = list[0];
    expect(dyne.shortDescription).toBe("Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.");
    expect(dyne.highlights).toEqual(["rostlinná receptura", "přirozeně bezlepková", "z čisté filtrované vody"]);
    expect(dyne.variants).toEqual([
      expect.objectContaining({ sku: "dynova-polevka", label: "3 l Rodinná zásoba (bag-in-box)", priceKc: 379, servings: 12, volumeMl: 3000 }),
    ]);
    expect(dyne.image).toBe("/eshop/dynova-polevka.jpg");
    expect(existsSync(path.join(PUBLIC, dyne.image!))).toBe(true);
    expect(dyne.foodInfo.nutritionPer100g).toBe(
      "na 100 ml: energie 283 kJ / 68 kcal, tuky 4 g (z toho nasycené 2,7 g), sacharidy 7,6 g (z toho cukry 2 g), bílkoviny 1 g, sůl 0,8 g, vláknina 1,1 g"
    );
    expect(dyne.foodInfo.ingredients).toMatch(/^čistá filtrovaná voda, dýně Hokkaido 39 %, kokosové mléko 15 %/);
    expect(dyne.foodInfo.storage).toMatch(/Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení\.$/);
    expect(dyne.foodInfo.allergens).toBeNull();
    const parsed = parseDescription(dyne.description);
    expect(parsed.intro).toHaveLength(3);
    expect(parsed.sections).toEqual([{ title: "Pro koho je vhodná", blocks: [{ type: "ul", items: expect.any(Array) }] }]);
    const category = (await loadCatalog(db)).categories.find((c) => c.slug === "polevky")!;
    expect(category.detailSections[0]).toEqual(expect.objectContaining({ title: "Vhodné také pro gastro provozy a kanceláře" }));
    expect(category.detailSections[0].paragraphs[0]).toBe("Polévky Begina jsou praktické řešení pro:");
    // Kulajda a Rajčatová jako v migraci 0014
    const seed = expectedCatalogAfterSeed().products.filter((p) => p.category === "polevky");
    expect(list.slice(1)).toEqual(seed.slice(1));
  });

  it("vrácení: Dýňová polévka přesně jako po migraci 0014; nové spuštění 41 vše vrátí", async () => {
    await pg.exec(file("49_polevky_rollback.sql"));
    expect(await soups()).toEqual(expectedCatalogAfterSeed().products.filter((p) => p.category === "polevky"));
    expect(await check(pg, "40_polevky_before.sql")).toBe("3 | 0 | Krémová polévka z dýně. | (bez názvu) | 379 | 0");
    await pg.exec(file("41_polevky.sql"));
    expect(await check(pg, "42_polevky_after.sql")).toBe("3 | 1 | ano | 3 l Rodinná zásoba (bag-in-box) | 379 | 12 | 1 | 1");
  });
});
