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
