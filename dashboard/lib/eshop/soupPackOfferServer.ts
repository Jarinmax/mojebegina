import "server-only";
// Cena Ochutnávky polévek 3 × 450 ml pro texty mimo produkt (Časté otázky):
// cena sady z katalogu + chlazená doprava podle její hmotnosti (aktuální palivový příplatek).
import { getCatalogIndex } from "./catalogServer";
import { applyFuelSurchargeFromDb } from "./fuelSurchargeServer";
import { coldShippingPrice } from "./shippingRates";
import { SOUP_PACK_SLUG } from "./soupPack";
import type { SoupPackOffer } from "./soupPackFaq";

export async function loadSoupPackOffer(): Promise<SoupPackOffer | null> {
  const index = await getCatalogIndex();
  const variant = index.getProduct(SOUP_PACK_SLUG)?.variants[0];
  if (!variant || !variant.weightGrams) return null;
  await applyFuelSurchargeFromDb();
  const cold = coldShippingPrice(variant.weightGrams);
  return cold.ok ? { priceKc: variant.priceKc, totalKc: variant.priceKc + cold.priceKc } : null;
}
