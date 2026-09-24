// Jediný vstupní bod pro server-side Neon Auth (Managed Better Auth).
// Security Phase 2.1 — pouze ověření identity, žádná autorizace zákaznických
// dat. Nepoužívá se z žádné existující stránky dashboardu.
import { createNeonAuth } from "@neondatabase/auth/next/server";
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
