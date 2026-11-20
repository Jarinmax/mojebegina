import "server-only";

// ESHOP 1.0 — katalog pro serverové komponenty a server actions e-shopu.
// cache() = jedno načtení z DB na request, i když ho čte layout, stránka
// i pokladna.
import { cache } from "react";
import { db } from "@/lib/db/client";
import { loadCatalog } from "./catalogDb";
import { loadReviewSummaries } from "./reviewsServer";
import { applyTastingSet } from "./tastingSetServer";
import { withoutGlassRange, withoutServingPrice } from "./productFacts";
import { createCatalogIndex } from "./catalogIndex";
import { shippingModeFromEnv } from "./shipping";
import { CAFE_TASTING_CATEGORY, isCafeTasting } from "./cafeTasting";
import { cafeTastingVisible } from "./cafeTastingServer";

// Hmotnosti balení jen s dopravou podle hmotnosti (ESHOP_WEIGHT_SHIPPING=on).
// Cena za porci je jen v řádku pod cenou a u půllitrových koktejlů se počítá
// sklenice 200 ml (rozhodnutí Lucie 17. 11. 2026) – z krátkého popisu proto
// mizí závorka s cenou a z poznámky balení odhad „2–3 nápoje“. Data v DB
// zůstávají beze změny.
export const getCatalog = cache(async () => {
  const [catalog, ratings] = await Promise.all([loadCatalog(db, { weights: shippingModeFromEnv() === "weight" }), loadReviewSummaries()]);
  // Ochutnávka do provozu (20. 11. 2026): kategorie se nikde neukazuje; produkt zůstává
  // v katalogu jen kvůli košíku a pokladně (a jen po spuštění / v náhledu).
  const tastingVisible = await cafeTastingVisible();
  const products = (await applyTastingSet(catalog.products)).filter((product) => tastingVisible || !isCafeTasting(product));
  return {
    ...catalog,
    // úvodní text kategorie Koktejly: „sáček 500 ml … (2–3 nápoje)“ bez odhadu
    categories: catalog.categories.filter((category) => category.slug !== CAFE_TASTING_CATEGORY).map((category) => ({
      ...category,
      intro: category.intro.map((paragraph) => paragraph.replace(/\s*\(\d+\s*[–-]\s*\d+\s+nápoj[eů]\)/giu, "")),
    })),
    products: products.map((product) => ({
      ...product,
      rating: ratings.get(product.slug),
      shortDescription: withoutServingPrice(product.shortDescription),
      variants: product.variants.map((variant) => ({ ...variant, detail: withoutGlassRange(variant.detail) })),
    })),
  };
});

export const getCatalogIndex = cache(async () => createCatalogIndex(await getCatalog()));
