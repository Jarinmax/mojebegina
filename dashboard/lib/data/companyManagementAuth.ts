// Security Phase 10 (Řízení firmy 1.0) — samostatná autorizační brána pro
// ZÁPISY v Řízení firmy (company_notes a další tabulky, které do téhle
// domény postupně přibudou — úkoly, priority...).
//
// Úmyslně NENÍ založená na requireAdmin/isAdmin z adminAuth.ts, ani na
// requireAdminOrExecutiveContext z admin.ts (ten je specificky pro čtení
// organizací). I když je pravidlo dnes stejné jako u čtení Řízení firmy
// (ADMIN nebo EXECUTIVE), jde o jinou funkci v jiném souboru, používanou
// jen pro tuhle doménu — viz zadání Fáze 10: případné zápisové pravomoci
// v Řízení firmy nesmí "cestou nejmenšího odporu" znamenat přístup do
// /admin. /admin zůstává jediná cesta k systémové administraci
// (lib/data/adminAuth.ts, requireAdmin), tady se to nikdy nesmí sdílet.
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export function requireCompanyManagementAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (ctx.systemRole !== "ADMIN" && ctx.systemRole !== "EXECUTIVE") {
    throw new ForbiddenError();
  }

  return ctx;
}
