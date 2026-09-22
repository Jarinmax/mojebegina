import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/data/authContext";
import { requireAdmin } from "@/lib/data/adminAuth";
import { backfillUserProfiles } from "@/lib/data/userProfiles";

// Security Phase 14 — JEDNORÁZOVÝ migrační backfill user_profiles pro
// uživatele založené před Fází 14. Záměrně NENÍ v žádné navigaci/UI, jen
// přímá URL pro ADMINA (POST, ať se nespustí náhodným prokliknutím GET
// prefetche). Route handler, ne server action — nemá smysl v žádném
// formuláři. AŽ SE NA PRODUCTION JEDNOU POTVRZENĚ SPUSTÍ ÚSPĚŠNĚ, TENHLE
// SOUBOR (celá složka) SE MÁ SMAZAT — není to trvalá funkce appky.
//
// Auth gate je tady, ne uvnitř backfillUserProfiles — viz komentář v
// lib/data/userProfiles.ts (cyklická závislost na authContext.ts).
export async function POST() {
  const ctx = await getAuthContext();
  requireAdmin(ctx);

  const summary = await backfillUserProfiles();
  return NextResponse.json(summary);
}
