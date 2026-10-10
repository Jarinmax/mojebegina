// Meta Pixel a cookie lišta CookieYes v e-shopu — konfigurace a čisté funkce
// (server i prohlížeč). Logika v prohlížeči: lib/eshop/metaPixel.ts,
// komponenta: components/eshop/Marketing.tsx. Návrh a pravidla:
// docs/begina-cutover/meta-cookieyes-ecomail.md.
//
// Výchozí stav = VYPNUTO. Zapíná se ve Vercelu (Environment Variables):
//   ESHOP_MARKETING=on          hlavní přepínač (jiná hodnota = vypnuto)
//   ESHOP_COOKIEYES_ID=<32 hex> kód webu z CookieYes (veřejný, ze skriptu)
//   ESHOP_META_PIXEL_ID=<číslo> ID pixelu (veřejné); bez CookieYes se pixel
//                               nikdy nenačte — není jak získat souhlas
// Platí jen pro stránky e-shopu (app/eshop), nikdy pro MojeBegina.
import type { PricedCart } from "./pricing";

type Env = Record<string, string | undefined>;

export type MarketingConfig = {
  cookieYesId: string;
  /** null = jen cookie lišta, bez pixelu */
  metaPixelId: string | null;
};

const COOKIEYES_ID = /^[a-f0-9]{32}$/;
const META_PIXEL_ID = /^\d{10,20}$/;

export function marketingConfig(env: Env = process.env): MarketingConfig | null {
  if (env.ESHOP_MARKETING !== "on") return null;
  const cookieYesId = (env.ESHOP_COOKIEYES_ID ?? "").trim();
  if (!COOKIEYES_ID.test(cookieYesId)) return null;
  const pixel = (env.ESHOP_META_PIXEL_ID ?? "").trim();
  return { cookieYesId, metaPixelId: META_PIXEL_ID.test(pixel) ? pixel : null };
}

export function cookieYesScriptUrl(cookieYesId: string): string {
  return `https://cdn-cookieyes.com/client_data/${cookieYesId}/script.js`;
}

/**
 * Stránka objednávky má v adrese náhodné id (jediný „klíč“ k objednávce).
 * Na ní se nenačítá CookieYes ani pixel a nic se neodesílá — Meta by
 * dostala adresu stránky (a s ní přístup k objednávce).
 */
export function isPrivateEshopPath(pathname: string): boolean {
  return /^(?:\/eshop)?\/objednavka(?:\/|$)/.test(pathname);
}

export type PurchaseEvent = {
  /** event_id pro Meta — podle VS (veřejné číslo, ne id objednávky); deduplikace */
  eventId: string;
  valueKc: number;
  contents: { id: string; quantity: number; item_price: number }[];
};

/** Nákup pro Meta: jen nově uložená objednávka s VS (opakované odeslání = null). */
export function purchaseEvent(
  saved: { paymentVs: string | null; alreadySaved: boolean },
  pricedCart: Pick<PricedCart, "lines" | "totalKc">
): PurchaseEvent | null {
  if (saved.alreadySaved || !saved.paymentVs || !/^7\d{7}$/.test(saved.paymentVs)) return null;
  return {
    eventId: `objednavka-${saved.paymentVs}`,
    valueKc: pricedCart.totalKc,
    contents: pricedCart.lines.map((line) => ({ id: line.sku, quantity: line.quantity, item_price: line.unitPriceKc })),
  };
}
