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
//   ESHOP_META_CAPI_TOKEN       tajný token Conversions API: dokončený nákup
//                               (Purchase) po úplném zaplacení ze serveru —
//                               lib/eshop/metaPurchase.ts; bez něj se nákup
//                               do Meta neposílá vůbec
// Platí jen pro stránky e-shopu (app/eshop), nikdy pro MojeBegina.
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
