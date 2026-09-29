// Testovací katalog = přesně to, co vrací DB po migraci 0013 (hlídá test
// parity v catalogDb.test.ts), jen bez nutnosti startovat PGlite.
import { createCatalogIndex } from "../../catalogIndex";
import { expectedCatalogAfterSeed } from "../../seedFromCatalog";

export const catalogIndex = createCatalogIndex(expectedCatalogAfterSeed());
