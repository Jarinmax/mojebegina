// POKLADNA BISTRA — kdo smí co (Lucie 26. 11. 2026).
//   • prodávat, stornovat dnešní účtenku a dělat uzávěrku: Viner, Lucie,
//     Blahout (o víkendech v bistru) — stejný okruh jako příjem na sklad,
//   • upravovat menu a zapínat zápis tržeb do Financí: jen Viner a Lucie.
import type { AuthContext } from "@/lib/data/types";
import { canConfirmGoodsReceipt } from "@/lib/data/skladAuth";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";

export function canUsePos(ctx: AuthContext): boolean {
  return canConfirmGoodsReceipt(ctx);
}

export function canManagePos(ctx: AuthContext): boolean {
  return isInvoiceIssuer(ctx);
}

export const POS_DENIED = "Pokladnu smí používat jen Jaroslav Viner, Lucie Königsbergová a Jaroslav Blahout.";
export const POS_MANAGE_DENIED = "Menu a zápis do Financí smí měnit jen Jaroslav Viner a Lucie Königsbergová.";
