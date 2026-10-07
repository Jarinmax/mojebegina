// ESHOP 1.0 — kdo smí vystavit fakturu do iDokladu a spustit kontrolu
// připojení iDokladu. Stejný princip jako financeAuth.ts (Finance 1.0):
// oprávnění podle KONKRÉTNÍ osoby (stabilní userId) A aktivní role ADMIN —
// ne jen podle role, aby přístup k Objednávkám (ADMIN/EXECUTIVE) sám
// o sobě neznamenal právo zapisovat do účetnictví.
//
// userId ověřeno v Production DB (user_profiles + user_roles, 4. 10. 2026):
//   Jaroslav Viner = de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c (ADMIN)
import { isAdmin } from "./adminAuth";
import type { AuthContext } from "./types";

export const INVOICE_ISSUER_USER_IDS: ReadonlySet<string> = new Set([
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", // Jaroslav Viner
]);

export function isInvoiceIssuer(ctx: AuthContext): boolean {
  return ctx !== null && !ctx.roleSelectionRequired && INVOICE_ISSUER_USER_IDS.has(ctx.userId) && isAdmin(ctx);
}
