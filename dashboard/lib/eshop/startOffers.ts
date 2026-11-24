// Nabídka ochutnávek pro karty „Jak začít“ (Pro kavárny i Nakupuji domů, 24. 11. 2026):
// ceny ze stejných údajů jako košík, chlazená doprava podle hmotnosti a aktuálního příplatku.
import type { CafeStartCardsProps } from "@/components/eshop/CafeStartCards";
import { coldShippingPrice } from "./shippingRates";
import { isSoupPack } from "./soupPack";
import { isTastingSet } from "./tastingSet";
import type { Product } from "./types";

export function startCardOffers(products: readonly Product[]): CafeStartCardsProps {
  const packProduct = products.find(isSoupPack);
  const packCold = packProduct ? coldShippingPrice(packProduct.variants[0]?.weightGrams ?? 1500) : null;
  const soupPack = packProduct?.variants[0] ? { priceKc: packProduct.variants[0].priceKc, coldShippingKc: packCold && packCold.ok ? packCold.priceKc : null } : null;
  const setProduct = products.find(isTastingSet);
  const syrupSet = setProduct?.variants[0] ? { priceKc: setProduct.variants[0].priceKc, includesShipping: setProduct.tastingCampaign !== undefined } : null;
  return { soupPack, syrupSet };
}
