// Testovací katalog = přesně to, co vrací DB po migraci 0014 (hlídá test
// parity v catalogDb.test.ts), jen bez nutnosti startovat PGlite.
//
// Jediný rozdíl: alergeny neověřené v seedu (null) jsou tu ověřené jako
// „bez alergenů“ ([]), aby šly produkty objednat — testy košíku, pokladny
// a zápisu objednávky alergeny neřeší. Blokaci neověřených alergenů (null)
// hlídá allergenGate.test.ts nad `unverifiedCatalogIndex`.
import { createCatalogIndex } from "../../catalogIndex";
import { expectedCatalogAfterSeed } from "../../seedFromCatalog";
import type { Catalog } from "../../types";

function withVerifiedAllergens(catalog: Catalog): Catalog {
  return {
    ...catalog,
    products: catalog.products.map((product) => ({
      ...product,
      foodInfo: { ...product.foodInfo, allergens: product.foodInfo.allergens ?? [] },
    })),
  };
}

export const catalogIndex = createCatalogIndex(withVerifiedAllergens(expectedCatalogAfterSeed()));

/** Katalog přesně podle seedu, včetně neověřených alergenů (null). */
export const unverifiedCatalogIndex = createCatalogIndex(expectedCatalogAfterSeed());
