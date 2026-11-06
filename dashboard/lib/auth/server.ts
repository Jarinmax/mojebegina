// Jediný vstupní bod pro server-side Neon Auth (Managed Better Auth).
// Security Phase 2.1 — pouze ověření identity, žádná autorizace zákaznických
// dat. Nepoužívá se z žádné existující stránky dashboardu.
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { createAuthServer, extractNeonAuthCookies } from "@neondatabase/auth/server";
import { headers } from "next/headers";
import { deriveNeonAuthBaseUrl } from "./neonAuthBaseUrl";

// Security Phase 2.6b — Neon–Vercel integrace nastavuje PGHOST správně pro
// KAŽDOU branch (Production i libovolný Preview), ale NEON_AUTH_BASE_URL
// per Preview nenastavuje vůbec — proto se auth endpoint odvozuje z PGHOST
// (viz lib/auth/neonAuthBaseUrl.ts pro přesný vzorec a zdůvodnění). Ruční
// NEON_AUTH_BASE_URL zůstává jen jako bezpečný fallback, kdyby PGHOST
// chybělo (např. lokální dev bez Neon proměnných).
const baseUrl =
  deriveNeonAuthBaseUrl(process.env.PGHOST, process.env.PGDATABASE) ??
  process.env.NEON_AUTH_BASE_URL!;

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});

// Next.js 16 nedovoluje měnit cookies během renderu Server Componentu.
// Neon Auth si ale při auth.getSession() může chtít obnovit pomocnou
// session_data cookie a jeho Next adapter pak volá cookies().set(), což shodí
// celou stránku (typicky /oauth/authorize po delší nečinnosti). Pro čisté čtení
// session proto používáme serverový klient s read-only request contextem.
// Primární session_token se normálně ověří proti Neon Auth; pouze se zde
// neukládá volitelná cache cookie. Zápisy cookies zůstávají v Route Handleru
// /api/auth přes `auth.handler()`, kde jsou v Next.js povolené.
export const sessionAuth = createAuthServer({
  baseUrl,
  cookieSecret: process.env.NEON_AUTH_COOKIE_SECRET!,
  context: async () => {
    const headerStore = await headers();
    return {
      getCookies: () => extractNeonAuthCookies(headerStore),
      setCookie: () => {},
      getHeader: (name: string) => headerStore.get(name),
      getOrigin: () =>
        headerStore.get("origin") ??
        headerStore.get("referer")?.split("/").slice(0, 3).join("/") ??
        "",
      getFramework: () => "nextjs",
    };
  },
});
