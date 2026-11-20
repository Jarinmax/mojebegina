// „Odkud nás zná“ — povinná informace od zákazníka (zadání Lucie 20. 11. 2026).
// Čistá logika bez DB: seznam možností, popisky, předvyplnění podle zdroje
// leadu a pravidlo povinnosti. Uložit zápis po hovoru, ve kterém se obchodník
// dovolal, nejde, dokud lead tuhle informaci nemá — když se zapomene zeptat,
// musí zákazníkovi zavolat znovu.

export const HEARD_FROM_OPTIONS = [
  "facebook_instagram",
  "google",
  "ai",
  "jina_kavarna",
  "doporuceni",
  "ochutnavka_akce",
  "bistro",
  "eshop",
  "oslovili_jsme",
  "jine",
] as const;
export type HeardFrom = (typeof HEARD_FROM_OPTIONS)[number];

export const HEARD_FROM_LABELS: Record<HeardFrom, string> = {
  facebook_instagram: "Facebook / Instagram (reklama, příspěvek)",
  google: "Google (vyhledávání, mapy)",
  ai: "ChatGPT nebo jiná AI",
  jina_kavarna: "Jiná kavárna nebo podnik",
  doporuceni: "Doporučení od známého",
  ochutnavka_akce: "Ochutnávka nebo akce",
  bistro: "Zahradní Bistro Begina",
  eshop: "E-shop begina.cz",
  oslovili_jsme: "Oslovili jsme ho my (náš obchodník)",
  jine: "Jiné",
};

/** Krátký popisek pro souhrny a štítky. */
export const HEARD_FROM_SHORT: Record<HeardFrom, string> = {
  facebook_instagram: "Facebook / Instagram",
  google: "Google",
  ai: "ChatGPT / AI",
  jina_kavarna: "Jiná kavárna",
  doporuceni: "Doporučení",
  ochutnavka_akce: "Ochutnávka / akce",
  bistro: "Bistro Begina",
  eshop: "E-shop",
  oslovili_jsme: "Oslovili jsme my",
  jine: "Jiné",
};

/** Ke které možnosti se doplňuje upřesnění (u „Jiné“ povinně). */
export const HEARD_FROM_DETAIL_HINT: Partial<Record<HeardFrom, string>> = {
  jina_kavarna: "Která kavárna / podnik?",
  doporuceni: "Od koho?",
  ochutnavka_akce: "Jaká akce?",
  jine: "Napiš konkrétně odkud",
};

export function isHeardFrom(value: string): value is HeardFrom {
  return (HEARD_FROM_OPTIONS as readonly string[]).includes(value);
}

/** Předvyplnění podle zdroje leadu — obchodník ho jen potvrdí, nebo změní. */
export function suggestHeardFrom(source: string | null | undefined): HeardFrom | null {
  switch (source) {
    case "meta":
      return "facebook_instagram";
    case "bistro":
      return "bistro";
    case "eshop":
      return "eshop";
    case "akce":
      return "ochutnavka_akce";
    case "doporuceni":
      return "doporuceni";
    case "vlastni_akvizice":
    case "existing_database":
      return "oslovili_jsme";
    default:
      return null;
  }
}

export function heardFromText(value: string | null, detail: string | null): string | null {
  if (!value || !isHeardFrom(value)) return null;
  const label = HEARD_FROM_SHORT[value];
  return detail ? `${label} – ${detail}` : label;
}

export type HeardFromInput = { heardFrom: string; heardFromDetail: string };
export type ValidatedHeardFrom = { heardFrom: HeardFrom; heardFromDetail: string | null } | null;

export const HEARD_FROM_MISSING_ERROR =
  "Chybí, odkud nás zákazník zná. Bez toho zápis nejde uložit — když ses zapomněl/a zeptat, zavolej mu znovu.";

// reached = obchodník se dovolal. alreadyKnown = lead už informaci má uloženou
// (pak je pole nepovinné a vyplněná hodnota ji jen přepíše).
export function validateHeardFromInput(
  input: HeardFromInput,
  opts: { reached: boolean; alreadyKnown: boolean }
): { ok: true; value: ValidatedHeardFrom } | { ok: false; error: string } {
  const raw = (input.heardFrom ?? "").trim();
  const detail = (input.heardFromDetail ?? "").trim();

  if (!raw) {
    if (opts.reached && !opts.alreadyKnown) {
      return { ok: false, error: HEARD_FROM_MISSING_ERROR };
    }
    return { ok: true, value: null };
  }
  if (!isHeardFrom(raw)) {
    return { ok: false, error: "Neplatná možnost u „Odkud nás zná“." };
  }
  if (raw === "jine" && !detail) {
    return { ok: false, error: "U „Jiné“ napiš konkrétně, odkud nás zákazník zná." };
  }
  if (detail.length > 200) {
    return { ok: false, error: "Upřesnění „Odkud nás zná“ je příliš dlouhé (max. 200 znaků)." };
  }
  return { ok: true, value: { heardFrom: raw, heardFromDetail: detail || null } };
}
