// Sklad 1.0 — kontroly před potvrzením příjemky: čistá logika bez
// "server-only" (texty hlášek, klíče varování, validace hlavičky dokladu).
// Samotné kontroly počítá JEDEN SQL dotaz v sklad.ts pod zámkem příjemky;
// tady se jeho řádek jen převede na srozumitelné hlášky.
//
// Dva druhy nálezů:
//   - překážka (blocker): potvrdit NELZE, dokud ji člověk neopraví
//     (nepotvrzené DPH, chybějící karta, jiný druh či jednotka než karta,
//     úplně stejný doklad už potvrzený),
//   - varování (warning): potvrdit lze, ale jen když ho člověk VÝSLOVNĚ
//     odsouhlasí. Klíč varování nese i konkrétní hodnoty (částky, id
//     příjemek) — souhlas s „nesoulad 268,80 × 244,80 Kč“ tak neplatí pro
//     jiný nesoulad, který vznikl úpravou řádku mezitím.
import { parseHaler } from "./skladValidation";

export type ConfirmationChecksRow = {
  status: string;
  line_count: number;
  lines_total_hal: number;
  document_total_hal: number | null;
  document_number: string | null;
  document_date: string | null;
  vat_unconfirmed: string[];
  unmapped: string[];
  kind_mismatch: string[];
  unit_mismatch: Array<{ name: string; unit: string; cardUnit: string }>;
  duplicates: OtherReceipt[];
  same_number_others: OtherReceipt[];
  same_date_total_others: OtherReceipt[];
  blockers: string[];
  warnings: string[];
};

type OtherReceipt = { id: string; number: string | null; date: string | null; totalHal: number | null };

export type ConfirmationIssue = { code: string; message: string };
export type ConfirmationWarning = { key: string; code: string; message: string };

export type ConfirmationChecks = {
  status: string;
  lineCount: number;
  linesTotalHal: number;
  documentTotalHal: number | null;
  blockers: ConfirmationIssue[];
  warnings: ConfirmationWarning[];
};

export function formatKc(hal: number): string {
  const sign = hal < 0 ? "−" : "";
  const [whole, fraction] = (Math.abs(hal) / 100).toFixed(2).split(".");
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction} Kč`;
}

function list(names: string[]): string {
  return names.map((name) => `„${name}“`).join(", ");
}

function describeOther(other: OtherReceipt): string {
  const parts = [other.number ? `č. ${other.number}` : "bez čísla", other.date ?? "bez data"];
  if (other.totalHal !== null) parts.push(formatKc(other.totalHal));
  return parts.join(", ");
}

const BLOCKER_MESSAGES: Record<string, (row: ConfirmationChecksRow) => string> = {
  not_draft: () => "Příjemka už byla potvrzena nebo stornována.",
  no_lines: () => "Příjemka nemá žádné řádky.",
  vat_unconfirmed: (row) => `Chybí potvrzení DPH u: ${list(row.vat_unconfirmed)}.`,
  unmapped: (row) => `Chybí skladová karta u: ${list(row.unmapped)}.`,
  kind_mismatch: (row) => `Druh řádku neodpovídá druhu skladové karty u: ${list(row.kind_mismatch)}.`,
  unit_mismatch: (row) =>
    `Jednotka řádku neodpovídá jednotce skladové karty u: ${row.unit_mismatch
      .map((issue) => `„${issue.name}“ (${issue.unit} × ${issue.cardUnit})`)
      .join(", ")} — přepočtěte množství na jednotku karty.`,
  duplicate: (row) =>
    `Stejný doklad (dodavatel, číslo, datum i částka) je už potvrzený: ${row.duplicates.map(describeOther).join("; ")}. ` +
    "Pokud jde o opravu, nejdřív stornujte původní příjemku.",
};

function warningMessage(code: string, row: ConfirmationChecksRow): string {
  switch (code) {
    case "totals_mismatch": {
      const diff = row.lines_total_hal - (row.document_total_hal ?? 0);
      return (
        `Součet řádků ${formatKc(row.lines_total_hal)} nesouhlasí s celkem na dokladu ${formatKc(row.document_total_hal ?? 0)} ` +
        `(rozdíl ${formatKc(diff)}). Zkontrolujte, že žádný řádek nechybí ani nepřebývá.`
      );
    }
    case "document_total_missing":
      return `Celková částka dokladu není zadaná — součet řádků ${formatKc(row.lines_total_hal)} nelze ověřit proti dokladu.`;
    case "document_number_missing":
      return "Doklad nemá číslo — duplicitu nelze spolehlivě ověřit.";
    case "same_number":
      return `Od tohoto dodavatele je už potvrzený doklad se stejným číslem (${row.same_number_others
        .map(describeOther)
        .join("; ")}). Může jít o duplicitu.`;
    case "same_date_total":
      return `Od tohoto dodavatele je už potvrzený doklad se stejným datem a částkou (${row.same_date_total_others
        .map(describeOther)
        .join("; ")}). Může jít o duplicitu.`;
    default:
      return code;
  }
}

export function describeConfirmationChecks(row: ConfirmationChecksRow): ConfirmationChecks {
  return {
    status: row.status,
    lineCount: row.line_count,
    linesTotalHal: row.lines_total_hal,
    documentTotalHal: row.document_total_hal,
    blockers: row.blockers.map((code) => ({ code, message: BLOCKER_MESSAGES[code]?.(row) ?? code })),
    warnings: row.warnings.map((key) => {
      const code = key.split(":")[0];
      return { key, code, message: warningMessage(code, row) };
    }),
  };
}

// --- Hlavička dokladu (číslo, datum, celková částka) ----------------------

export type ReceiptHeaderInput = { documentNumber: string; documentDate: string; documentTotalWithVat: string };
export type ValidatedReceiptHeader = {
  documentNumber: string | null;
  documentDate: string | null;
  documentTotalWithVatHal: number | null;
};

export function validateReceiptHeaderInput(
  input: ReceiptHeaderInput
): { ok: true; value: ValidatedReceiptHeader } | { ok: false; error: string } {
  const documentNumber = input.documentNumber.trim().replace(/\s+/g, " ");
  if (documentNumber.length > 100) {
    return { ok: false, error: "Číslo dokladu je příliš dlouhé." };
  }
  const documentDate = input.documentDate.trim();
  if (documentDate && !isValidIsoDate(documentDate)) {
    return { ok: false, error: "Datum dokladu musí být platné datum." };
  }
  const totalText = input.documentTotalWithVat.trim().replace(/\s/g, "");
  let documentTotalWithVatHal: number | null = null;
  if (totalText) {
    documentTotalWithVatHal = parseHaler(totalText);
    if (documentTotalWithVatHal === null || documentTotalWithVatHal < 0) {
      return { ok: false, error: "Celková částka dokladu musí být nezáporné číslo." };
    }
  }
  return {
    ok: true,
    value: { documentNumber: documentNumber || null, documentDate: documentDate || null, documentTotalWithVatHal },
  };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
