// Security Phase 19 (Denní volání 1.0) — sdílené popisky, stejný vzor jako
// ../leadLabels.ts.
//
// CALL_RESULT_LABELS se odsud přestěhoval do ../leadLabels.ts (Jarda –
// volání a provize, část 1, bod 2 doplňku) — používá ho teď sdílená
// CallOutcomeFields na obou obrazovkách ("Dnešní volání" i "Všechny
// leady"), ne jen tahle.

// Fronta je v V1 koncepčně vždy pro Blahouta (DAILY_CALL_LEAD_OWNER_USER_ID
// v dailyCallsAuth.ts — fixní filtr pro automatický výběr) — pevný popisek,
// ne odvozené jméno přihlášeného uživatele (Viner může frontu jako
// pracovník obsluhovat taky, fronta ale zůstává "pro Blahouta").
export const DAILY_CALL_QUEUE_RECIPIENT_NAME = "Jaroslav Blahout";
