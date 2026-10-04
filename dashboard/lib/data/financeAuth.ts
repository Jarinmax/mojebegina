// Finance 1.0 — izolovaná auth brána, stejný princip jako dailyCallsAuth.ts:
// oprávnění podle KONKRÉTNÍ osoby (stabilní userId), role je druhá,
// nezávislá podmínka. Finanční data jsou citlivější než zbytek Řízení firmy,
// proto žádný ADMIN/EXECUTIVE mimo seznam (např. Jaroslav Blahout, Jiří
// Střelec) nesmí dostat přístup jen tím, že má stejnou roli.
//
// Schváleno pro V1:
//   Jaroslav Viner        — čtení + nastavení + ruční spuštění synchronizace
//   Lucie Königsbergová   — jen čtení (odsouhlasuje účetní správnost čísel)
//
// userId ověřena v Production DB (user_profiles + user_roles, 4. 10. 2026),
// NE podle zobrazovaného jména:
//   Jaroslav Viner      = de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c (ADMIN)
//   Lucie Königsbergová = f9f93f03-92b0-4724-becd-c0a3576b5275 (EXECUTIVE, CUSTOMER)
import { isAdmin, isAdminOrExecutive } from "./adminAuth";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

const FINANCE_READER_USER_IDS = new Set<string>([
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", // Jaroslav Viner
  "f9f93f03-92b0-4724-becd-c0a3576b5275", // Lucie Königsbergová
]);

const FINANCE_MANAGER_USER_IDS = new Set<string>([
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", // Jaroslav Viner
]);

// Čtení cockpitu. Aktivní role musí být ADMIN nebo EXECUTIVE — Lucie má
// i roli CUSTOMER, v té ale Finance neuvidí (stejně jako zbytek Řízení
// firmy). roleSelectionRequired = aktivní role není potvrzená volbou,
// takže se k autorizaci nesmí použít (viz lib/data/types.ts).
export function isFinanceReader(ctx: AuthContext): boolean {
  return (
    ctx !== null &&
    !ctx.roleSelectionRequired &&
    FINANCE_READER_USER_IDS.has(ctx.userId) &&
    isAdminOrExecutive(ctx)
  );
}

// Nastavení připojení a ruční „Synchronizovat nyní“. V1 jen Viner a jen
// s aktivní rolí ADMIN.
export function isFinanceManager(ctx: AuthContext): boolean {
  return (
    ctx !== null &&
    !ctx.roleSelectionRequired &&
    FINANCE_MANAGER_USER_IDS.has(ctx.userId) &&
    isAdmin(ctx)
  );
}

export function requireFinanceReadAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!isFinanceReader(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}

export function requireFinanceManageAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!isFinanceManager(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}
