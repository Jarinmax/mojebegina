// Security Phase 16 (Obchod/CRM 1.0) — sdílené popisky/barvy, stejný vzor
// jako orderLabels.ts.
import type { LeadStage, LeadSource, VenueType, CallResult } from "@/lib/data/leadValidation";

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "Lead",
  contacted: "Kontaktován",
  interested: "Zájem",
  sample_offer: "Vzorek/Nabídka",
  negotiating: "Jednání",
  converted: "Zákazník",
  callback_later: "Ozvat se později",
  not_interested: "Nezájem",
};

export const STAGE_CLASSES: Record<LeadStage, string> = {
  new: "bg-neutral-100 text-neutral-700 border-neutral-200",
  contacted: "bg-sky-50 text-sky-700 border-sky-200",
  interested: "bg-sky-50 text-sky-700 border-sky-200",
  sample_offer: "bg-amber-50 text-amber-700 border-amber-200",
  negotiating: "bg-amber-50 text-amber-700 border-amber-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  callback_later: "bg-neutral-100 text-neutral-500 border-neutral-200",
  not_interested: "bg-neutral-100 text-neutral-400 border-neutral-200 line-through",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  existing_database: "Existující databáze",
  bistro: "Bistro",
  eshop: "E-shop",
  akce: "Akce/trh",
  doporuceni: "Doporučení",
  inbound: "Inbound poptávka",
  vlastni_akvizice: "Vlastní akvizice",
};

export const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  kavarna: "Kavárna",
  bistro: "Bistro",
  restaurace: "Restaurace",
  hotel: "Hotel",
  jine: "Jiné",
};

// Jarda – volání a provize, část 1, bod 2 doplňku — přesunuto sem z
// dnes/dailyCallLabels.ts, aby ho mohla použít sdílená CallOutcomeFields
// (obchod/CallOutcomeFields.tsx, společná pro "Dnešní volání" i "Všechny
// leady"), ne jen samotné "Dnešní volání".
export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  reached_interested: "Dovoláno – zájem",
  reached_not_interested: "Dovoláno – bez zájmu",
  no_answer: "Nedovoláno",
  call_back_later: "Zavolat později",
  invalid_contact: "Neplatný kontakt",
};
