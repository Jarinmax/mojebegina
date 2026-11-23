// Obchodník jen pro Obchod/CRM (Lucie 22. 11. 2026): Jarda Blahout má v
// MojeBegina vidět jen Obchod / CRM (leady, zákazníky, Dnešní volání,
// Manuál) a svou Moji práci (úkoly, hovory, odměny). Lucie a Jarin vidí
// všechno. Role zůstává EXECUTIVE (kvůli CRM), omezení dělá tenhle seznam.
import { DAILY_CALL_LEAD_OWNER_USER_ID } from "./dailyCallsAuth";
import type { AuthContext } from "./types";

export const SALES_ONLY_USER_IDS: readonly string[] = [DAILY_CALL_LEAD_OWNER_USER_ID];

export function isSalesOnly(ctx: AuthContext): boolean {
  return ctx !== null && SALES_ONLY_USER_IDS.includes(ctx.userId);
}

/** Domovská stránka obchodníka a jediná část Řízení firmy, kam smí. */
export const SALES_ONLY_HOME = "/rizeni-firmy/obchod";

export function salesOnlyPathAllowed(pathname: string): boolean {
  return pathname === SALES_ONLY_HOME || pathname.startsWith(`${SALES_ONLY_HOME}/`);
}

/** Nástroje ChatGPT asistenta, které obchodník smí — jen leady a zákazníci. */
export const SALES_ONLY_AGENT_TOOLS: ReadonlySet<string> = new Set([
  "list_leads",
  "get_lead",
  "add_lead_note",
  "set_lead_next_step",
  "search_crm",
  "get_customer",
  "add_customer_note",
  "update_customer",
  "get_daily_call_report",
  "get_salesperson_activity",
  "my_overview",
]);
