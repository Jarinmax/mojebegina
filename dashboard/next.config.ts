import type { NextConfig } from "next";

// Security Phase 2.5 — bezpečnostní HTTP hlavičky + explicitní no-store na
// zákaznických/autentizovaných routách.
//
// CSP záměrně NENÍ součástí téhle fáze: Next.js potřebuje pro hydrataci
// inline skript s RSC payloadem, což bez nonce/proxy infrastruktury
// (žádný proxy.ts v projektu) znamená buď 'unsafe-inline' (oslabuje smysl
// CSP), nebo pečlivé zapojení nonců přes proxy — obojí je větší, rizikovější
// zásah, než odpovídá "nejmenšímu bezpečnému kroku". Odloženo do
// samostatného hardeningu (viz PRODUCTION_GO_LIVE_CHECKLIST.md).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const noStoreHeader = { key: "Cache-Control", value: "private, no-store" };

// Routy, které mohou vracet zákaznická nebo autentizovaná data (dashboard,
// přihlašovací formulář — ten čte session a redirectuje podle ní — a
// samotné Neon Auth API). Ostatní routy (/doporucit) jsou zatím čistě
// statický mock bez napojení na session, proto tu nejsou.
const noStoreSources = [
  "/",
  "/login",
  "/profil",
  "/objednavky",
  "/partnersky-program",
  "/vyhoda/partnerska-sleva",
  "/upozorneni",
  "/api/auth/:path*",
];

// Domény (proxy.ts, lib/site/hosts.ts): begina.cz a www.begina.cz = veřejný
// web a e-shop, cokoli jiného = MojeBegina. `has`/`missing` typu host se
// porovnává s hlavičkou Host (bez portu) celou hodnotou.
const PUBLIC_HOSTS = "(?:www\\.)?begina\\.cz";

// HSTS
// - MojeBegina (moje.begina.cz): 2 roky, včetně subdomén — beze změny. BEZ
//   `preload` — to je nevratný krok vázaný na finální doménu.
// - begina.cz: zatím 1 týden a BEZ includeSubDomains — hlavní doména by
//   jinak vynutila HTTPS na všech subdoménách begina.cz (pošta, webmail…).
//   Prodloužit až po stabilním provozu a kontrole subdomén.
const HSTS_INTERNAL = { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" };
const HSTS_PUBLIC = { key: "Strict-Transport-Security", value: "max-age=604800" };

// Stránka objednávky zákazníka: adresa obsahuje náhodné id (jediný „klíč“) —
// neposílat ji dál v Referer (Stripe, odkazy ven) a neukládat do cache.
const ORDER_PAGE_HEADERS = [noStoreHeader, { key: "Referrer-Policy", value: "no-referrer" }];

// Stará přesměrování /gdpr, /obchodni-podminky, /doprava jsou v proxy.ts
// (lib/site/routing.ts) — next.config redirects běží PŘED proxy a na
// begina.cz by vedla na /eshop/…
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/:path*",
        missing: [{ type: "host", value: PUBLIC_HOSTS }],
        headers: [HSTS_INTERNAL],
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: PUBLIC_HOSTS }],
        headers: [HSTS_PUBLIC],
      },
      // /eshop/objednavka/<id> (moje.begina.cz) i /objednavka/<id> (begina.cz)
      { source: "/eshop/objednavka/:path*", headers: ORDER_PAGE_HEADERS },
      { source: "/objednavka/:path*", headers: ORDER_PAGE_HEADERS },
      ...noStoreSources.map((source) => ({
        source,
        headers: [noStoreHeader],
      })),
    ];
  },
};

export default nextConfig;
