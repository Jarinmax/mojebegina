// Manuál pro obchodníky (Lucie 20. 11. 2026): vidí jen Jaroslav Viner,
// Lucie a Jarda Blahout. Stránka je jen ke čtení — text se mění jen ve
// zdrojovém kódu (lib/obchod/salesManual.ts), takže „Jarda jen pro čtení“
// platí pro všechny.
import { DAILY_CALL_LEAD_OWNER_USER_ID } from "./dailyCallsAuth";
import { LUCIE_USER_ID, WORK_MANAGER_USER_ID } from "./workTasksAuth";
import type { AuthContext } from "./types";

export const SALES_MANUAL_USER_IDS: readonly string[] = [
  WORK_MANAGER_USER_ID, // Jaroslav Viner
  LUCIE_USER_ID, // Lucie Königsbergová
  DAILY_CALL_LEAD_OWNER_USER_ID, // Jaroslav Blahout
];

export function canReadSalesManual(ctx: AuthContext): boolean {
  return ctx !== null && SALES_MANUAL_USER_IDS.includes(ctx.userId);
}
