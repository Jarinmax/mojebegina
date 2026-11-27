// Objednávky placené až při předání (Lucie 23. 11. 2026, případ Art-n-coffee):
// ruční objednávky „hotově“, „dobírkou“ nebo „na fakturu“ se vyrábějí hned,
// nečekají na platbu. E-shop má jen platbu předem (převod / karta) — ty dál
// čekají na zaplacení.

/** Regex (PostgreSQL ~* i JS) pro způsoby platby „až při předání / po dodání“. */
export const PAY_LATER_PATTERN = "hotov|dob[ií]rk|na fakturu|fakturou|při předání|pri predani";

const re = new RegExp(PAY_LATER_PATTERN, "i");

/** true = platí se až při předání nebo po dodání → patří rovnou do výroby. */
export function isPayLater(methodCode: string | null | undefined, methodLabel: string | null | undefined): boolean {
  if (methodCode) return false; // e-shopové kódy (prevod, karta) jsou platba předem
  return !!methodLabel && re.test(methodLabel);
}

/**
 * Poznámka k platbě ve Výrobě. Na fakturu (Jarin 27. 11. 2026, Milan Kašpárek):
 * faktura jde zákazníkovi předem a platí se později se splatností — zboží se
 * předá i nezaplacené. Hotově / dobírkou se platí opravdu až při předání.
 */
export function payLaterNote(method: string | null | undefined): string {
  if (method && /faktur/i.test(method)) return "na fakturu se splatností";
  return `platí ${method ?? "hotově"} při předání`;
}
