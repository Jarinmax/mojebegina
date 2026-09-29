// Security Phase 17 (CEO přehled 1.0) — vlastní izolovaná auth brána,
// stejný princip jako adminAuth.ts/crmAuth.ts/companyNodeAuth.ts: každá
// doména má svou vlastní bránu, nikdy sdílenou, aby zúžení/rozšíření
// jedné domény nemohlo omylem ovlivnit jinou.
//
// Na rozdíl od VŠECH ostatních bran v aplikaci NENÍ tahle založená na
// systemRole (ADMIN/EXECUTIVE/...) — je to schválený allowlist konkrétních
// lidí (Jaroslav Viner, Jiří Střelec). Firemní role EXECUTIVE dnes mají i
// Jaroslav Blahout a Lucie Königsbergová, kteří CEO přehled vidět nemají —
// isAdminOrExecutive (app/rizeni-firmy/layout.tsx) by je pustila, proto se
// tu záměrně nepoužívá.
//
// V1.0 schváleno natvrdo v kódu (nejmíň kódu, nejmíň rizika — přidání
// dalšího čtenáře je stejně akce, která má projít review/deployem, ne
// tichá změna za běhu). Pokud by seznam měl v budoucnu růst často, dá se
// nahradit sloupcem v DB beze změny volajícího kódu (requireCeoFocusContext
// zůstává jediné místo, které o tom rozhoduje).
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

const ALLOWED_EMAILS = new Set(["viner.jaroslav@gmail.com", "jstrelec@vlastnicesta.cz"]);

export function isCeoFocusAllowed(ctx: AuthContext): boolean {
  return ctx !== null && ALLOWED_EMAILS.has(ctx.email.toLowerCase());
}

export function requireCeoFocusAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!isCeoFocusAllowed(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}
