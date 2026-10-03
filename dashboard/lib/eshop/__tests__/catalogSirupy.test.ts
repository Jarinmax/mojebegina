// ESHOP 1.0 — katalogový skript Bylinné sirupy (docs/eshop-catalog/3x_*)
// nad PGlite se všemi migracemi: přesně ty soubory, které vedení spustí
// v Neon SQL Editoru (Preview, později Production).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { parseDescription } from "../productDescription";
import { createMigratedDb } from "./helpers/migratedDb";
import { sirupySql } from "../../../scripts/eshop-catalog/build-sirupy.mjs";

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

describe("katalog — Bylinné sirupy: soubor", () => {
  it("31_sirupy.sql = výstup generátoru (scripts/eshop-catalog/build-sirupy.mjs)", () => {
    expect(file("31_sirupy.sql")).toBe(sirupySql());
  });
});

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
    expect(parseDescription(saman.description).intro).toHaveLength(3);
    expect(parseDescription(saman.description).sections.map((x) => [x.title, x.blocks.map((b) => b.type)])).toEqual([
      ["Pro koho je vhodný", ["ul"]],
      ["Jak jej používat", ["ul", "p", "p"]],
    ]);
    expect(saman.taste!.split("\n\n")).toHaveLength(2);
    expect(saman.foodInfo.ingredients).toMatch(/čaga \(Inonotus obliquus\), ženšen pravý \(Panax ginseng\), zázvor \(Zingiber officinale\)\), citronová šťáva 10 %/);
    expect(saman.warnings).toEqual(["Není vhodné pro děti do 3 let, těhotné a kojící ženy."]);
    expect(syrups.slice(1).every((p) => p.warnings.length === 0)).toBe(true);
    expect(saman.shortDescription).toMatch(/přibližně na 3,70 Kč\.$/);
    // Zázvorový: úplné údaje z begina.cz (výživa na 100 ml).
    const zazvor = syrups[1];
    expect(zazvor.shortDescription).toMatch(/přibližně na 3,30 Kč\.$/);
    expect(zazvor.highlights[0]).toBe("39 % bylinného výluhu");
    expect(zazvor.taste).toMatch(/^Chuť je intenzivní, přímá a autenticky pálivá/);
    expect(zazvor.foodInfo.ingredients).toMatch(/^třtinový cukr, bylinný výluh 39 % \(čistá filtrovaná voda, zázvor/);
    expect(zazvor.foodInfo.nutritionPer100g).toBe(
      "na 100 ml: energie 1\u00a0105 kJ / 260 kcal, tuky 0 g (z toho nasycené 0 g), sacharidy 65 g (z toho cukry 64 g), bílkoviny 0 g, sůl 0 g"
    );
    expect(zazvor.foodInfo.storage).toMatch(/spotřebujte do 3 měsíců od otevření/);
    expect(parseDescription(zazvor.description).sections.map((x) => [x.title, x.blocks.map((b) => b.type)])).toEqual([
      ["Pro koho je vhodný", ["ul"]],
      ["Jak sirup používat", ["ul", "p", "p"]],
    ]);
    // Co na begina.cz není (alergeny, trvanlivost; u ostatních vše) → „Doplníme“, nic vymyšleného.
    expect(syrups.every((p) => p.foodInfo.allergens === null && p.foodInfo.shelfLife === null)).toBe(true);
    expect(syrups.filter((p) => p.foodInfo.ingredients !== null).map((p) => p.slug)).toEqual(["bylinny-sirup-saman", "zazvorovy-sirup", "lipovy-sirup", "ibiskovy-sirup", "sipkovy-sirup", "hermankovy-sirup", "medunkovy-sirup-s-levanduli"]);
    // Lipový: úplné údaje (složení s lipovým květem, vlastní znění skladování)
    const lipa = syrups[2];
    expect(lipa.shortDescription).toMatch(/přibližně na 3,70 Kč\.$/);
    expect(lipa.highlights[0]).toBe("39 % bylinného výluhu");
    expect(lipa.description[0]).toMatch(/^Lipový sirup nabízí jemnou, medovou/);
    expect(lipa.taste).toMatch(/^Chuť je hluboká, medově jemná/);
    expect(lipa.foodInfo.ingredients).toMatch(/lipový květ \(Tiliae flos\)/);
    expect(lipa.foodInfo.nutritionPer100g).toMatch(/^na 100 ml: energie 1\u00a0105 kJ \/ 260 kcal/);
    expect(lipa.foodInfo.storage).toMatch(/v dobře uzavřeném obalu v chladu a temnu a spotřebujte do 3 měsíců\./);
    expect(parseDescription(lipa.description).sections.map((x) => x.title)).toEqual(["Pro koho je vhodný", "Jak sirup používat"]);
    expect(parseDescription(lipa.description).sections[0].blocks).toEqual([
      { type: "ul", items: expect.arrayContaining(["**Pro děti i dospělé:** díky své jemnosti a přirozeně nasládlému profilu chutná celé rodině."]) },
    ]);
    // Šípkový: 40 % výluhu, citronová šťáva 9 %, šípek (Rosa canina)
    const sipek = syrups[4];
    expect(sipek.name).toBe("Šípkový sirup");
    expect(sipek.shortDescription).toMatch(/přibližně na 3,30 Kč\.$/);
    expect(sipek.highlights[0]).toBe("40 % bylinného výluhu");
    expect(sipek.foodInfo.ingredients).toMatch(/bylinný výluh 40 % \(čistá filtrovaná voda, šípek \(Rosa canina\)\), citronová šťáva 9 %/);
    expect(parseDescription(sipek.description).sections.map((x) => [x.title, x.blocks.map((b) => b.type)])).toEqual([
      ["Pro koho je vhodný", ["ul"]],
      ["Jak sirup používat", ["ul", "p", "p"]],
    ]);
    // Ibiškový: 41 % výluhu, citronová šťáva 8 %, nadpis „Pro koho vhodný“ doslova
    const ibisek = syrups[3];
    expect(ibisek.name).toBe("Ibiškový sirup");
    expect(ibisek.highlights[0]).toBe("41 % bylinného výluhu");
    expect(ibisek.foodInfo.ingredients).toMatch(/bylinný výluh 41 % \(čistá filtrovaná voda, květ ibišku \(Hibiscus sabdariffa\)\), citronová šťáva 8 %/);
    expect(parseDescription(ibisek.description).sections.map((x) => x.title)).toEqual(["Pro koho vhodný", "Jak jej používat"]);
    // Heřmánkový: 36 % výluhu, citronová šťáva 16 %
    const herm = syrups[5];
    expect(herm.name).toBe("Heřmánkový sirup");
    expect(herm.highlights[0]).toBe("36 % bylinného výluhu");
    expect(herm.foodInfo.ingredients).toMatch(/bylinný výluh 36 % \(čistá filtrovaná voda, květ heřmánku \(Matricaria chamomilla\)\), citronová šťáva 16 %/);
    expect(parseDescription(herm.description).sections.map((x) => x.title)).toEqual(["Pro koho je vhodný", "Jak ho používat"]);
    // Meduňkový s levandulí: 36 % výluhu, citronová šťáva 16 %
    const medunka = syrups[6];
    expect(medunka.foodInfo.ingredients).toMatch(/meduňka \(Melissa officinalis\), květ levandule \(Lavandula angustifolia\)\), citronová šťáva 16 %/);
    // všech 7: úplné texty z begina.cz
    for (const p of syrups) {
      const parsed = parseDescription(p.description);
      expect([p.slug, parsed.intro.length, parsed.sections.length, p.highlights.length, p.taste !== null, p.foodInfo.nutritionPer100g !== null, p.foodInfo.storage !== null]).toEqual([p.slug, 3, 2, 4, true, true, true]);
    }
    // Balení: popis u všech sirupů
    expect(syrups.every((p) => p.variants[0].description!.startsWith("Pro snadnou manipulaci") && p.variants[1].description!.startsWith("Lehké a nerozbitné"))).toBe(true);
    const category = catalog.categories.find((c) => c.slug === "sirupy")!;
    // společná sekce detailu (i pro Šamana)
    expect(category.detailSections).toEqual([
      expect.objectContaining({ title: "Vhodné také pro gastro provozy a kanceláře", bullets: ["kavárny", "bistra", "menší restaurace", "kanceláře", "catering"] }),
    ]);
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
    expect(catalog.categories.find((c) => c.slug === "sirupy")!.detailSections).toEqual([]);
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM products WHERE slug LIKE '%sirup%'`);
    expect(rows[0].n).toBe(7);
    await pg.exec(file("31_sirupy.sql"));
    catalog = await loadCatalog(db);
    expect(catalog.products.filter((p) => p.category === "sirupy")).toHaveLength(7);
  });
});
