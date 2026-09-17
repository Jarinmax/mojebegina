// Jediný vstupní bod pro server-side Neon Auth (Managed Better Auth).
// Security Phase 2.1 — pouze ověření identity, žádná autorizace zákaznických
// dat. Nepoužívá se z žádné existující stránky dashboardu.
import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
