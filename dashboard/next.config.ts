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
  // 2 roky, včetně subdomén. BEZ `preload` — to je nevratný krok vázaný na
  // finální doménu (moje.begina.cz), ne na *.vercel.app Preview alias.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...noStoreSources.map((source) => ({
        source,
        headers: [noStoreHeader],
      })),
    ];
  },
};

export default nextConfig;
