// Security Phase 2.2 — jádro autorizace. Čistá funkce, žádné I/O samo o
// sobě: DB dotaz na membership dostává jako parametr (`getMembership`),
// takže se dá otestovat proti syntetickým datům bez skutečné databáze a
// nejde ji omylem zavolat bez ověřené identity.
//
// KRITICKÝ princip: `ctx.userId` a `ctx.systemRole` musí vždy pocházet ze
// server-side session (viz lib/data/authContext.ts), nikdy z
// organizationId nebo jiného parametru poslaného klientem. Tahle funkce
// sama o sobě žádnou identitu nepřijímá jako "co klient tvrdí" — jen jako
// `ctx`, který si volající already muselo ověřit.

import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { Action, AuthContext, Membership } from "./types";

export type GetMembership = (
  userId: string,
  organizationId: string
) => Promise<Membership | null>;

export async function requireOrgAccess(
  ctx: AuthContext,
  organizationId: string,
  action: Action,
  getMembership: GetMembership
): Promise<{ userId: string; organizationId: string }> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }

  // ADMIN: plný přístup (read i write) napříč všemi organizacemi.
  if (ctx.systemRole === "ADMIN") {
    return { userId: ctx.userId, organizationId };
  }

  // EXECUTIVE: read napříč všemi organizacemi, ale ne write.
  if (ctx.systemRole === "EXECUTIVE" && action === "read") {
    return { userId: ctx.userId, organizationId };
  }

  // CUSTOMER / EMPLOYEE / EXECUTIVE-write: přístup jen přes vlastní
  // členství v dané organizaci. EMPLOYEE má prozatím stejný rozsah jako
  // CUSTOMER — přesná "omezená oprávnění" nejsou ještě navržená, takže
  // bezpečný default je žádná eskalace navíc.
  const membership = await getMembership(ctx.userId, organizationId);
  if (!membership) {
    throw new ForbiddenError();
  }

  return { userId: ctx.userId, organizationId };
}
