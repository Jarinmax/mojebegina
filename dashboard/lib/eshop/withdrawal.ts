// Online odstoupení od smlouvy — „tlačítko“ podle § 1830a občanského
// zákoníku (zákon č. 159/2026 Sb., účinnost 1. 1. 2027; v e-shopu už od
// 6. 11. 2026). Postup: tlačítko „Odstoupit od smlouvy“ → spotřebitel
// vyplní nebo potvrdí jméno, údaje o smlouvě a e-mail → tlačítko
// „Potvrdit odstoupení od smlouvy“ → bez zbytečného odkladu potvrzení
// e-mailem (textová podoba) s obsahem prohlášení a datem a časem odeslání.
// Bez přihlášení, bez CAPTCHA; další údaje jen nepovinně.

export const WITHDRAW_BUTTON_LABEL = "Odstoupit od smlouvy";
export const WITHDRAW_CONFIRM_LABEL = "Potvrdit odstoupení od smlouvy";

export type WithdrawalInput = {
  name: string;
  email: string;
  /** číslo objednávky nebo jiné údaje, podle kterých smlouvu dohledáme (povinné) */
  contract: string;
  /** které zboží vrací (nepovinné; prázdné = celá objednávka) */
  items: string;
  /** poznámka (nepovinné) */
  note: string;
};

export type WithdrawalStatement = WithdrawalInput & {
  /** okamžik odeslání prohlášení spotřebitelem */
  submittedAt: Date;
};

const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cleanMultiline = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max) : "";

export function validateWithdrawal(raw: Record<string, unknown>): { ok: true; value: WithdrawalInput } | { ok: false; error: string; field: keyof WithdrawalInput } {
  const value: WithdrawalInput = {
    name: clean(raw.name, 120),
    email: clean(raw.email, 200).toLowerCase(),
    contract: clean(raw.contract, 200),
    items: cleanMultiline(raw.items, 1000),
    note: cleanMultiline(raw.note, 1000),
  };
  if (value.name.length < 2) return { ok: false, field: "name", error: "Vyplňte prosím jméno a příjmení." };
  if (!EMAIL.test(value.email)) return { ok: false, field: "email", error: "Vyplňte prosím e-mail, na který vám pošleme potvrzení." };
  if (value.contract.length < 2) {
    return { ok: false, field: "contract", error: "Vyplňte prosím číslo objednávky, případně datum nákupu a co jste objednali." };
  }
  return { ok: true, value };
}

/** Číslo objednávky z údajů o smlouvě (např. „9260010“, „č. 9260010“), jinak null. */
export function orderNumberFrom(contract: string): number | null {
  const match = contract.match(/\b(\d{6,9})\b/);
  return match ? Number(match[1]) : null;
}

/** Datum a čas odeslání v Praze, např. „6. 11. 2026 v 22:41:05“. */
export function formatSubmittedAt(date: Date): string {
  const d = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).format(date);
  const t = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${d} v ${t}`;
}

/** Obsah prohlášení tak, jak ho spotřebitel odeslal (pro potvrzení i záznam). */
export function statementLines(s: WithdrawalStatement): [string, string][] {
  return [
    ["Prohlášení", "Oznamuji, že tímto odstupuji od kupní smlouvy uzavřené v e-shopu Begina.cz."],
    ["Jméno a příjmení", s.name],
    ["E-mail pro potvrzení", s.email],
    ["Objednávka / údaje o smlouvě", s.contract],
    ["Vracené zboží", s.items || "celá objednávka"],
    ...(s.note ? ([["Poznámka", s.note]] as [string, string][]) : []),
    ["Odesláno", `${formatSubmittedAt(s.submittedAt)} (čas v ČR)`],
  ];
}
