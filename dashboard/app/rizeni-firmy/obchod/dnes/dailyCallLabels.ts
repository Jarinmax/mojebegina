// Security Phase 19 (Denní volání 1.0) — sdílené popisky, stejný vzor jako
// ../leadLabels.ts.
import type { CallResult } from "@/lib/data/dailyCallsValidation";

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  reached_interested: "Dovoláno – zájem",
  reached_not_interested: "Dovoláno – bez zájmu",
  no_answer: "Nedovoláno",
  call_back_later: "Zavolat později",
  invalid_contact: "Neplatný kontakt",
};

// Fronta je v V1 koncepčně vždy pro Blahouta (DAILY_CALL_LEAD_OWNER_USER_ID
// v dailyCallsAuth.ts — fixní filtr pro automatický výběr) — pevný popisek,
// ne odvozené jméno přihlášeného uživatele (Viner může frontu jako
// pracovník obsluhovat taky, fronta ale zůstává "pro Blahouta").
export const DAILY_CALL_QUEUE_RECIPIENT_NAME = "Jaroslav Blahout";
