// Průvodní text e-mailu s fakturou (Lucie 26. 11. 2026): vždy oslovení
// „Dobrý den, pane Kašpárku,“ — nikdy holé „Dobrý den,“ — a profesionální
// text: poděkování, číslo a částka, splatnost a odkaz na platební údaje na faktuře.
import { formatCzDay, formatKc } from "./ownInvoice";
import { suggestSalutation } from "../salutation";

export type InvoiceEmailFacts = {
  number: string;
  totalKc?: number | null;
  /** RRRR-MM-DD */
  dueDate?: string | null;
  paid: boolean;
};

/** „Dobrý den, pane Kašpárku,“ — null, když z jména oslovení nejde odvodit. */
const NOT_A_PERSON = /(s\.\s?r\.\s?o|a\.\s?s\.|spol\.|z\.\s?s\.|z\.\s?ú|o\.\s?p\.\s?s|v\.\s?o\.\s?s|café|cafe|kavárn|bistro|restaura|pizzer|cukrár|centrum|\d)/i;

export function invoiceGreeting(name: string | null | undefined): string | null {
  const raw = (name ?? "").trim();
  if (!raw || NOT_A_PERSON.test(raw) || raw.split(/\s+/).length > 4) return null;
  const salutation = suggestSalutation(raw);
  return salutation ? `Dobrý den, ${salutation},` : null;
}

/** Odstavce mezi oslovením a podpisem. */
export function invoiceEmailParagraphs(f: InvoiceEmailFacts): string[] {
  const amount = f.totalKc != null ? ` na částku ${formatKc(f.totalKc)}` : "";
  const first = `děkujeme za Vaši objednávku. V příloze Vám zasíláme fakturu č. ${f.number}${amount}.`;
  if (f.paid) {
    return [first, "Faktura je již uhrazená, není tedy potřeba nic platit.", "V případě jakýchkoli dotazů jsme Vám rádi k dispozici."];
  }
  const due = f.dueDate ? ` do ${formatCzDay(f.dueDate)}` : " do data splatnosti uvedeného na faktuře";
  return [
    first,
    `Prosíme o její úhradu${due}. Veškeré platební údaje — číslo účtu, variabilní symbol i QR kód pro rychlou platbu v bankovní aplikaci — najdete přímo na faktuře.`,
    "V případě jakýchkoli dotazů jsme Vám rádi k dispozici.",
  ];
}
