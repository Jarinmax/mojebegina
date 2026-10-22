import type { BonusStatus } from "@/lib/data/commission";

// Jarda – volání a provize, část 2 — "unknown" se nikde nezobrazuje jako
// chip (chybí acquiredByUserId/acquiredAt, typicky starý zákazník před
// zavedením téhle funkce) — volající místa ho mají zvlášť ošetřit.
export const BONUS_STATUS_LABELS: Record<BonusStatus, string> = {
  unknown: "Nelze doložit",
  not_eligible: "Nesplňuje podmínky",
  running: "Běží",
  reached: "Dosažen",
  paid: "Vyplacen",
};

// Jen paleta appky (žádná zelená/modrá — viz tailwind.config.ts komentář u
// begina-primary): šedá pro neutrální stavy, červený akcent pro "běží",
// plná černá pro "dosaženo"/"vyplaceno".
export const BONUS_STATUS_CLASSES: Record<BonusStatus, string> = {
  unknown: "bg-neutral-100 text-neutral-500",
  not_eligible: "bg-neutral-100 text-neutral-500",
  running: "bg-begina-accent-100 text-begina-accent-700",
  reached: "bg-begina-primary-900 text-begina-primary-50",
  paid: "bg-begina-primary-800 text-begina-primary-50",
};
