// Security Phase 12 (Řízení firmy 2.0) — samostatná autorizační brána pro
// uzly živé mapy firmy (company_nodes, company_node_activity). Stejný
// princip jako companyManagementAuth.ts: úmyslně NENÍ založená na
// requireAdmin/isAdmin z adminAuth.ts ani na requireCompanyManagementAccess
// z companyManagementAuth.ts — vlastní, strukturálně oddělená funkce se
// stejným pravidlem (ADMIN nebo EXECUTIVE), aby zápisové pravomoci v Řízení
// firmy nikdy "cestou nejmenšího odporu" neznamenaly přístup do /admin.
//
// MVP: EMPLOYEE zůstává mimo — schváleno explicitně, `/rizeni-firmy` gate
// (isAdminOrExecutive v adminAuth.ts) se v týhle fázi neupravuje. Až bude
// EMPLOYEE aktivovaný, mění se jen tenhle soubor (přidají se per-akci
// predikáty typu canEditStatus/canComment s jemnější granularitou), ne
// desítky míst v kódu.
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export function requireCompanyNodeAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (ctx.systemRole !== "ADMIN" && ctx.systemRole !== "EXECUTIVE") {
    throw new ForbiddenError();
  }

  return ctx;
}
