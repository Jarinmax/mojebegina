// Security Phase 16 (Obchod/CRM 1.0) — vlastní izolovaná brána, stejný
// princip jako orderAuth.ts/companyNodeAuth.ts: nesdílí se s adminAuth.ts,
// aby žádná budoucí změna oprávnění v jedné doméně omylem neovlivnila druhou.
//
// 18. 11. 2026 — obchodník (Jaroslav Blahout) je zaměstnanec (EMPLOYEE),
// ne vedení. Do CRM smí, ale vidí a mění JEN svoje leady a zákazníky
// (owner_user_id = on). Vedení (ADMIN, EXECUTIVE) vidí vše jako dřív.
// Obchodník je určen konkrétním userId A rolí EMPLOYEE (obě podmínky,
// stejný princip jako dailyCallsAuth.ts) — jiný EMPLOYEE (výroba,
// spolupracovníci) se do CRM tím automaticky nedostane.
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export const SALES_REP_USER_IDS: ReadonlySet<string> = new Set<string>([
  "06240ac4-c050-47ea-998c-6c81389edf9f", // Jaroslav Blahout
]);

/** Obchodník (zaměstnanec s přístupem jen do Obchodu, jen k vlastním kontaktům). */
export function isSalesRep(ctx: AuthContext): boolean {
  return ctx !== null && ctx.systemRole === "EMPLOYEE" && SALES_REP_USER_IDS.has(ctx.userId);
}

/** Vedení — vidí všechny leady a zákazníky, přiřazuje je, převádí. */
export function crmSeesAll(ctx: AuthContext): boolean {
  return ctx !== null && (ctx.systemRole === "ADMIN" || ctx.systemRole === "EXECUTIVE");
}

export function requireCrmAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (!crmSeesAll(ctx) && !isSalesRep(ctx)) {
    throw new ForbiddenError();
  }

  return ctx;
}

export function requireCrmManager(ctx: AuthContext): NonNullable<AuthContext> {
  const checked = requireCrmAccess(ctx);
  if (!crmSeesAll(checked)) {
    throw new ForbiddenError();
  }
  return checked;
}
