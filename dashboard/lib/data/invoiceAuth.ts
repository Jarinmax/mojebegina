// ESHOP 1.0 — kdo smí vystavit fakturu do iDokladu a spustit kontrolu
// připojení iDokladu. Stejný princip jako financeAuth.ts (Finance 1.0):
// oprávnění podle KONKRÉTNÍ osoby (stabilní userId) A její AKTIVNÍ role
// vedení — ne jen podle role, aby přístup k Objednávkám (ADMIN/EXECUTIVE)
// sám o sobě neznamenal právo zapisovat do účetnictví.
//
// userId ověřeno v Production DB (user_profiles + user_roles):
//   Jaroslav Viner      = de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c (ADMIN, 4. 10. 2026)
//   Lucie Königsbergová = f9f93f03-92b0-4724-becd-c0a3576b5275 (EXECUTIVE, 8. 10. 2026)
// Lucie je finanční ředitelka — faktury a platby jsou její doména; oprávnění
// schválil majitel 8. 10. 2026. Nepřidává jí roli ADMIN: smí jen tohle,
// a jen s aktivní rolí EXECUTIVE (CUSTOMER nestačí).
import type { AuthContext, SystemRole } from "./types";

export const INVOICE_ISSUERS: ReadonlyMap<string, SystemRole> = new Map<string, SystemRole>([
  ["de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", "ADMIN"], // Jaroslav Viner
  ["f9f93f03-92b0-4724-becd-c0a3576b5275", "EXECUTIVE"], // Lucie Königsbergová
]);

export const INVOICE_ISSUER_NAMES = "Jaroslav Viner a Lucie Königsbergová";

export function isInvoiceIssuer(ctx: AuthContext): boolean {
  return ctx !== null && !ctx.roleSelectionRequired && INVOICE_ISSUERS.get(ctx.userId) === ctx.systemRole;
}
