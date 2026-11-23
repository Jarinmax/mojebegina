// Cena nápoje ze sirupu v úvodu kategorie Sirupy.
// 23. 11. 2026 (Lucie/ChatGPT): všude jen modelová cena VČETNĚ dopravy při 3 × 3 l
// (dřívější „od 3,33 Kč bez dopravy“ mátlo vedle 3,92 Kč s dopravou na úvodu).
import { syrupDrinkRows } from "./landingPages";
import { formatServingKc } from "./productFacts";

/** „nápoj už od 3,30 Kč“ (text z DB) → „nápoj od 3,92 Kč (200 ml) včetně dopravy při objednávce 3 × 3 l“ */
export function withSyrupDrinkPrice(paragraph: string): string {
  const kc = syrupDrinkRows([3])[0].perPortionKc;
  return paragraph.replace(
    /nápoj(?: už)? od [\d\s\u00a0]+,\d{1,2}\s?Kč(?: za 200 ml)?(?: bez dopravy)?/g,
    `nápoj od ${formatServingKc(kc)} (200 ml) včetně dopravy při objednávce 3 × 3 l`
  );
}
