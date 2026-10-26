// Staré adresy produktů z WordPressu po přepnutí DNS: každý ze 28 produktů
// ze sitemapy begina.cz (audit 10. 10. 2026) musí vést na funkční stránku —
// buď na produkt v katalogu (stav Production: skripty 31–61), nebo, dokud je
// skrytý, dočasně na svou kategorii. Ověřeno nad PGlite se všemi migracemi.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createCatalogIndex, type CatalogIndex } from "../catalogIndex";
import { HIDDEN_LEGACY_PRODUCTS, legacyProductFallback } from "../legacyProducts";
import { route } from "@/lib/site/routing";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const catalogFile = (name: string) => readFileSync(path.join(ROOT, "docs/eshop-catalog", name), "utf8");
const AUDIT = readFileSync(path.join(ROOT, "docs/begina-cutover/audit-2026-10-10.md"), "utf8");
const WP_SLUGS = /Slugy produktů ve WooCommerce[^:]*: ([a-z0-9, -]+)/.exec(AUDIT)![1].split(", ");

describe("staré adresy produktů z WordPressu", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const index = async (): Promise<CatalogIndex> => createCatalogIndex(await loadCatalog(db));

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    for (const name of ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "61_zmrzliny.sql"]) await pg.exec(catalogFile(name));
  }, 120_000);

  it("audit obsahuje 28 produktů; /produkt/<slug>/ na begina.cz → 301 bez lomítka → stránka produktu e-shopu", () => {
    expect(WP_SLUGS).toHaveLength(28);
    for (const slug of WP_SLUGS) {
      expect(route({ host: "begina.cz", pathname: `/produkt/${slug}/`, search: "", method: "GET" })).toMatchObject({
        kind: "redirect",
        location: `https://begina.cz/produkt/${slug}`,
        status: 301,
      });
      expect(route({ host: "begina.cz", pathname: `/produkt/${slug}`, search: "", method: "GET" })).toMatchObject({
        kind: "rewrite",
        path: `/eshop/produkt/${slug}`,
      });
    }
  });

  it("stav Production: 25 produktů je v katalogu, 3 chybějící vedou dočasně na Ovocné nápoje (Připravujeme)", async () => {
    const catalog = await index();
    const missing = WP_SLUGS.filter((slug) => !catalog.getProduct(slug));
    expect(missing).toEqual(Object.keys(HIDDEN_LEGACY_PRODUCTS));
    for (const slug of missing) expect(legacyProductFallback(slug, catalog)).toBe("/kategorie/ovocne-napoje");
    expect(catalog.findCategory("ovocne-napoje")).toBeDefined();
    expect(legacyProductFallback("neexistuje", catalog)).toBeNull();
    expect(legacyProductFallback("kulajda", catalog)).toBeNull();
  });

  it("po 71 (skryté) beze změny; bez kategorie → úvod", async () => {
    await pg.exec(catalogFile("71_ovocne_napoje.sql"));
    const catalog = await index();
    for (const slug of Object.keys(HIDDEN_LEGACY_PRODUCTS)) {
      expect(catalog.getProduct(slug)).toBeUndefined();
      expect(legacyProductFallback(slug, catalog)).toBe("/kategorie/ovocne-napoje");
      expect(legacyProductFallback(slug, { findCategory: () => undefined })).toBe("/");
    }
  });
});
