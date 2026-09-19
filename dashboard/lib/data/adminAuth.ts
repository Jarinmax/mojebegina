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
