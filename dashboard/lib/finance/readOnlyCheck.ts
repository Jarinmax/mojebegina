// Finance 1.0 — první read-only ověření připojení k iDokladu.
//
// Co se čte (jen GET, přes pojistku klienta):
//   • GET /Account/CurrentAgenda — název, IČO, režim DPH, tarif,
//   • u každé kolekce 1 stránka o velikosti 1 → jen POČET záznamů
//     (TotalItems). Obsah dokladu se do výsledku nedostane,
//   • číselné řady (GET /NumericSequences): ID, název, formát, typ dokladu,
//     výchozí — pro výběr e-shopové řady faktur. Nic se nezakládá ani nemění.
// Nic se neukládá do DB; výsledek je jen pro zobrazení přihlášenému
// Vinerovi. Odpovídá i na otevřenou otázku, které agendy Begina v iDokladu
// skutečně používá (banka, pokladna, prodejky).
import type { IdokladClient } from "./idoklad/client";
import type { IdokladCollection } from "./idoklad/endpoints";
import { IdokladError } from "./idoklad/errors";
import type { ApiAgenda, ApiNumericSequence } from "./idoklad/apiTypes";
import { normalizeAgenda, toIsoDate } from "./idoklad/normalize";
import type { VatMode } from "./types";

export const READ_ONLY_CHECK_COLLECTIONS: Array<{ collection: IdokladCollection; label: string }> = [
  { collection: "IssuedInvoices", label: "Vydané faktury" },
  { collection: "CreditNotes", label: "Dobropisy" },
  { collection: "ProformaInvoices", label: "Zálohové faktury" },
  { collection: "SalesReceipts", label: "Prodejky" },
  { collection: "IssuedDocumentPayments", label: "Úhrady vydaných dokladů" },
  { collection: "ReceivedInvoices", label: "Přijaté faktury" },
  { collection: "ReceivedReceipts", label: "Přijaté účtenky" },
  { collection: "ReceivedDocumentPayments", label: "Úhrady přijatých faktur" },
  { collection: "Contacts", label: "Kontakty" },
  { collection: "Tags", label: "Štítky" },
  { collection: "BankAccounts", label: "Bankovní účty" },
  { collection: "BankStatements", label: "Bankovní pohyby" },
  { collection: "CashRegisters", label: "Pokladny" },
  { collection: "CashVouchers", label: "Pokladní doklady" },
];

const SUBSCRIPTION_NAMES: Record<number, string> = { 0: "Free", 1: "Basic", 2: "Standard", 3: "Premium" };

/** Typ dokladu číselné řady — ověřený je jen 0 (vydané faktury), ostatní se ukazují číslem. */
const SEQUENCE_DOCUMENT_TYPES: Record<string, string> = { "0": "Vydané faktury", IssuedInvoice: "Vydané faktury" };

/** Řada ve výsledku testu (jen nutná pole, max. MAX_SEQUENCES řádků). */
export type NumericSequenceRow = {
  id: number | null;
  name: string | null;
  numberFormat: string | null;
  documentType: string | null;
  isDefault: boolean | null;
  lastNumber: number | null;
  year: number | null;
};

export const MAX_SEQUENCES = 20;

/**
 * Výpis řad jde na stránku testu ve VLASTNÍ podepsané cookie (hlavní
 * výsledek sám zabírá ~2,5 kB z limitu ~4 kB) a ve zhuštěném tvaru:
 * [id, název, formát, typ dokladu, výchozí, poslední číslo, rok].
 */
export type SequenceTuple = [number | null, string | null, string | null, string | null, boolean | null, number | null, number | null];

const cap = (value: string | null, max: number) => (value && value.length > max ? `${value.slice(0, max - 1)}…` : value);

export function packSequences(rows: NumericSequenceRow[]): SequenceTuple[] {
  return rows
    .slice(0, MAX_SEQUENCES)
    .map((r) => [r.id, cap(r.name, 40), cap(r.numberFormat, 30), r.documentType, r.isDefault, r.lastNumber, r.year]);
}

export function unpackSequences(tuples: SequenceTuple[]): NumericSequenceRow[] {
  return tuples.map(([id, name, numberFormat, documentType, isDefault, lastNumber, year]) => ({
    id,
    name,
    numberFormat,
    documentType,
    isDefault,
    lastNumber,
    year,
  }));
}

/** Rozdělí výsledek na hlavní cookie (bez řad) a cookie s řadami. */
export function splitResultForCookies(result: ReadOnlyCheckResult): {
  main: Omit<ReadOnlyCheckResult, "numericSequences" | "numericSequencesError">;
  sequences: { s: SequenceTuple[] | null; e: string | null };
} {
  const { numericSequences, numericSequencesError, ...main } = result;
  return { main, sequences: { s: numericSequences ? packSequences(numericSequences) : null, e: numericSequencesError } };
}

export function sequenceDocumentTypeLabel(type: string | null): string {
  return type === null ? "neuvedeno" : (SEQUENCE_DOCUMENT_TYPES[type] ?? `typ ${type}`);
}

export function numericSequenceRow(seq: ApiNumericSequence): NumericSequenceRow {
  const type = seq.DocumentType === undefined || seq.DocumentType === null ? null : String(seq.DocumentType);
  return {
    id: typeof seq.Id === "number" ? seq.Id : null,
    name: seq.Name ?? null,
    numberFormat: seq.NumberFormat ?? null,
    documentType: type,
    isDefault: typeof seq.IsDefault === "boolean" ? seq.IsDefault : null,
    lastNumber: typeof seq.LastNumber === "number" ? seq.LastNumber : null,
    year: typeof seq.Year === "number" ? seq.Year : null,
  };
}

export type ReadOnlyCheckResult = {
  ok: true;
  checkedAt: string;
  agenda: {
    name: string | null;
    ico: string | null;
    vatMode: VatMode | "identified_person" | null;
    subscription: string | null;
    subscriptionTrial: boolean | null;
    subscriptionTo: string | null;
  };
  // true = agenda má IČO Beginy (FINANCE_COMPANY_ICO); null = IČO Beginy
  // není nastavené, nelze rozhodnout.
  isBeginaAgenda: boolean | null;
  vatModeConfigured: VatMode | null;
  vatMatches: boolean | null;
  counts: Array<{ collection: string; label: string; total: number | null; error: string | null }>;
  /** číselné řady agendy (null = nepodařilo se načíst, viz numericSequencesError) */
  numericSequences: NumericSequenceRow[] | null;
  numericSequencesError: string | null;
  requestCount: number;
  refreshTokenReturned: boolean;
};

export type ReadOnlyCheckFailure = { ok: false; checkedAt: string; code: string; message: string };

export async function runReadOnlyAccountCheck(options: {
  client: IdokladClient;
  companyIco: string | null;
  vatModeConfigured: VatMode | null;
  now: Date;
  refreshTokenReturned?: boolean;
}): Promise<ReadOnlyCheckResult> {
  const { client } = options;
  const apiAgenda = await client.get<ApiAgenda>("/Account/CurrentAgenda");
  const agenda = normalizeAgenda(apiAgenda);
  const subscriptionType = apiAgenda.Subscription?.Type;
  const subscription =
    typeof subscriptionType === "number"
      ? (SUBSCRIPTION_NAMES[subscriptionType] ?? String(subscriptionType))
      : typeof subscriptionType === "string"
        ? subscriptionType
        : null;

  const counts: ReadOnlyCheckResult["counts"] = [];
  for (const { collection, label } of READ_ONLY_CHECK_COLLECTIONS) {
    try {
      const page = await client.getPage<unknown>(collection, 1, { pageSize: 1 });
      counts.push({ collection, label, total: page.totalItems, error: null });
    } catch (error) {
      if (error instanceof IdokladError) {
        // Přihlášení, limit nebo blokace platí pro všechny další dotazy → konec.
        if (["auth_failed", "rate_limited", "budget_exhausted", "request_blocked", "api_not_allowed", "billing"].includes(error.code)) {
          throw error;
        }
        counts.push({ collection, label, total: null, error: error.userMessage });
        continue;
      }
      throw error;
    }
  }

  // Číselné řady: jedna stránka (agenda jich má jednotky). Chyba zde
  // nezastaví zbytek testu — jen se ukáže místo výpisu.
  let numericSequences: NumericSequenceRow[] | null = null;
  let numericSequencesError: string | null = null;
  try {
    const page = await client.getPage<ApiNumericSequence>("NumericSequences", 1, { pageSize: 100 });
    numericSequences = page.items
      .map(numericSequenceRow)
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .slice(0, MAX_SEQUENCES);
  } catch (error) {
    if (error instanceof IdokladError) {
      if (["auth_failed", "rate_limited", "budget_exhausted", "request_blocked", "api_not_allowed", "billing"].includes(error.code)) {
        throw error;
      }
      numericSequencesError = error.userMessage;
    } else {
      throw error;
    }
  }

  return {
    ok: true,
    checkedAt: options.now.toISOString(),
    agenda: {
      name: agenda.name,
      ico: agenda.ico,
      vatMode: agenda.vatMode,
      subscription,
      subscriptionTrial: typeof apiAgenda.Subscription?.IsTrial === "boolean" ? apiAgenda.Subscription.IsTrial : null,
      subscriptionTo: toIsoDate(apiAgenda.Subscription?.DateTo ?? null),
    },
    isBeginaAgenda: options.companyIco ? agenda.ico === options.companyIco : null,
    vatModeConfigured: options.vatModeConfigured,
    vatMatches: options.vatModeConfigured ? agenda.vatMode === options.vatModeConfigured : null,
    counts,
    numericSequences,
    numericSequencesError,
    requestCount: client.requestCount,
    refreshTokenReturned: options.refreshTokenReturned ?? false,
  };
}
