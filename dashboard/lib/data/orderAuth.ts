// Security Phase 15 (Objednávky 1.0) — samostatná autorizační brána pro
// objednávky (orders, order_activity), stejný princip jako
// companyNodeAuth.ts/companyManagementAuth.ts: úmyslně NENÍ založená na
// requireAdmin/isAdmin z adminAuth.ts ani na jiné doménové bráně —
// vlastní, strukturálně oddělená funkce se stejným pravidlem (ADMIN nebo
// EXECUTIVE), aby zápisové pravomoci v Řízení firmy nikdy "cestou
// nejmenšího odporu" neznamenaly přístup do /admin.
//
// MVP: EMPLOYEE zůstává mimo, stejně jako u company_nodes — až bude
// aktivovaný, mění se jen tenhle soubor.
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export function canAccessOrders(ctx: AuthContext): boolean {
  return ctx !== null && (ctx.systemRole === "ADMIN" || ctx.systemRole === "EXECUTIVE");
}

export function requireOrderAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (!canAccessOrders(ctx)) {
    throw new ForbiddenError();
  }

  return ctx;
}
