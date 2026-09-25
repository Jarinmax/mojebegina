// Security Phase 16 (Obchod/CRM 1.0) — vlastní izolovaná brána, stejný
// princip jako orderAuth.ts/companyNodeAuth.ts: ADMIN a EXECUTIVE mají
// přístup, nesdílí se s adminAuth.ts, aby žádná budoucí změna oprávnění
// v jedné doméně omylem neovlivnila druhou.
//
// Schváleno explicitně: CRM 1.0 = ADMIN + EXECUTIVE, žádná nová SALES role.
// Samostatný soubor je tu ale připravený přesně proto, aby šla SALES role
// (užší přístup — jen vlastní leady/zákazníky, ne celé Řízení firmy) později
// zapojit jen úpravou tohohle jednoho souboru, beze změny Objednávek nebo
// Živé mapy firmy.
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export function requireCrmAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (ctx.systemRole !== "ADMIN" && ctx.systemRole !== "EXECUTIVE") {
    throw new ForbiddenError();
  }

  return ctx;
}
