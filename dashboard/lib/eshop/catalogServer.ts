import "server-only";

// ESHOP 1.0 — katalog pro serverové komponenty a server actions e-shopu.
// cache() = jedno načtení z DB na request, i když ho čte layout, stránka
// i pokladna.
import { cache } from "react";
import { db } from "@/lib/db/client";
import { loadCatalog } from "./catalogDb";
import { withoutGlassRange, withoutServingPrice } from "./productFacts";
import { createCatalogIndex } from "./catalogIndex";
import { shippingModeFromEnv } from "./shipping";

// Hmotnosti balení jen s dopravou podle hmotnosti (ESHOP_WEIGHT_SHIPPING=on).
// Cena za porci je jen v řádku pod cenou a u půllitrových koktejlů se počítá
// sklenice 200 ml (rozhodnutí Lucie 17. 11. 2026) – z krátkého popisu proto
// mizí závorka s cenou a z poznámky balení odhad „2–3 nápoje“. Data v DB
// zůstávají beze změny.
export const getCatalog = cache(async () => {
  const catalog = await loadCatalog(db, { weights: shippingModeFromEnv() === "weight" });
  return {
    ...catalog,
    // úvodní text kategorie Koktejly: „sáček 500 ml … (2–3 nápoje)“ bez odhadu
    categories: catalog.categories.map((category) => ({
      ...category,
      intro: category.intro.map((paragraph) => paragraph.replace(/\s*\(\d+\s*[–-]\s*\d+\s+nápoj[eů]\)/giu, "")),
    })),
    products: catalog.products.map((product) => ({
      ...product,
      shortDescription: withoutServingPrice(product.shortDescription),
      variants: product.variants.map((variant) => ({ ...variant, detail: withoutGlassRange(variant.detail) })),
    })),
  };
});

export const getCatalogIndex = cache(async () => createCatalogIndex(await getCatalog()));
