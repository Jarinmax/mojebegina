// Security Phase 1.1B — autorizační jádro Begina Adminu. Čistá funkce,
// stejný vzor jako authz.ts (requireOrgAccess): žádné I/O, testovatelná
// proti syntetickým datům, nejde ji omylem zavolat bez ověřené identity.
//
// Admin nemá žádné organizationMembership — jeho oprávnění je čistě
// ctx.systemRole === "ADMIN" (viz lib/db/schema.ts userRoles). Nekontroluje
// se tu nic per-organizaci, protože ADMIN smí vždy vše (requireOrgAccess
// pro zákaznická data to už respektuje samo).
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export function requireAdmin(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (ctx.systemRole !== "ADMIN") {
    throw new ForbiddenError();
  }

  return ctx;
}

// Security Phase 7 (Executive 1.0) — čisté predikáty pro routing guardy
// (app/admin/layout.tsx, app/executive/layout.tsx). Na rozdíl od
// requireAdmin/requireAdminOrExecutive nic nevyhazují — layouty je použijí
// k rozhodnutí o redirectu, ne k ochraně datové vrstvy.
export function isAdmin(ctx: AuthContext): boolean {
  return ctx?.systemRole === "ADMIN";
}

export function isExecutive(ctx: AuthContext): boolean {
  return ctx?.systemRole === "EXECUTIVE";
}

// EXECUTIVE má cross-organizační READ (viz requireOrgAccess v authz.ts pro
// zákaznická data) — tahle funkce je jeho obdoba pro admin datovou vrstvu,
// ale POUZE pro čtecí funkce (listOrganizations, getOrganizationDetail).
// Všechny mutace (createCustomerOrganization, updateOrganization,
// addOrganizationMember, removeOrganizationMember, resendActivationLink)
// zůstávají výhradně za requireAdmin/requireAdminContext — EXECUTIVE tam
// nesmí, i kdyby si to UI dovolilo zavolat.
export function requireAdminOrExecutive(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  if (!isAdmin(ctx) && !isExecutive(ctx)) {
    throw new ForbiddenError();
  }

  return ctx;
}
