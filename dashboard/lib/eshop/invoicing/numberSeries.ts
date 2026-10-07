// ESHOP 1.0 — e-shopová číselná řada vydaných faktur v iDokladu.
//
// Rozhodnutí vedení 5. 10. 2026: e-shop má VLASTNÍ řadu oddělenou od B2B;
// čísla přiděluje iDoklad. MojeBegina zná jen ID řady
// (IDOKLAD_ESHOP_SEQUENCE_ID) a před ostrým vystavováním ho ověří proti
// seznamu řad v iDokladu (GET /v3/NumericSequences, jen čtení):
//   • řada existuje,
//   • je to řada vydaných faktur (DocumentType 0 = IssuedInvoice),
//   • NENÍ výchozí — výchozí řadu používá ruční B2B fakturace v iDokladu
//     (a WooCommerce plugin); e-shop by se s ní promíchal.
// Čistý modul bez sítě; seznam řad dodá čtecí klient iDokladu.
import type { InvoiceProblem } from "./draft";

/** iDoklad API v3: DocumentType vydaných faktur. */
export const ISSUED_INVOICE_DOCUMENT_TYPE = 0;

/** Čtecí dotaz na řady vydaných faktur (jen GET). */
export const NUMERIC_SEQUENCES_LOOKUP = {
  method: "GET",
  path: "/v3/NumericSequences",
  query: `filter=DocumentType~eq~${ISSUED_INVOICE_DOCUMENT_TYPE}`,
} as const;

/** Řada tak, jak ji vrací iDoklad (jen pole, která potřebujeme). */
export type IdokladNumericSequence = {
  Id: number;
  Name?: string | null;
  NumberFormat?: string | null;
  DocumentType: number;
  IsDefault: boolean;
  LastNumber?: number | null;
  Year?: number | null;
};

export type SeriesConfig = { id: string | null; problem: InvoiceProblem | null };

/** IDOKLAD_ESHOP_SEQUENCE_ID: kladné celé číslo (ID řady v iDokladu), jinak problém. */
export function parseSeriesId(raw: string | undefined): SeriesConfig {
  const value = raw?.trim();
  if (!value) {
    return {
      id: null,
      problem: {
        code: "no_number_series",
        severity: "live",
        message: "Chybí ID e-shopové číselné řady v iDokladu (IDOKLAD_ESHOP_SEQUENCE_ID) — doplnit před ostrým vystavováním.",
      },
    };
  }
  if (!/^[1-9][0-9]{0,9}$/.test(value)) {
    return {
      id: null,
      problem: {
        code: "invalid_number_series",
        severity: "live",
        message: `IDOKLAD_ESHOP_SEQUENCE_ID „${value}“ není platné ID řady (kladné celé číslo z iDokladu).`,
      },
    };
  }
  return { id: value, problem: null };
}

export type SeriesCheck =
  | { ok: true; sequence: IdokladNumericSequence; summary: string }
  | { ok: false; problems: InvoiceProblem[] };

function describe(seq: IdokladNumericSequence): string {
  const parts = [seq.Name, seq.NumberFormat && `formát ${seq.NumberFormat}`, seq.Year && `rok ${seq.Year}`];
  const last = seq.LastNumber != null ? `poslední číslo ${seq.LastNumber}` : null;
  return [...parts, last].filter(Boolean).join(", ") || `řada ${seq.Id}`;
}

/** Ověří nastavené ID proti řadám z iDokladu (výsledek čtecího dotazu výše). */
export function checkEshopSeries(configuredId: string | null, sequences: IdokladNumericSequence[]): SeriesCheck {
  if (!configuredId) {
    return { ok: false, problems: [parseSeriesId(undefined).problem!] };
  }
  const sequence = sequences.find((s) => String(s.Id) === configuredId);
  if (!sequence) {
    return {
      ok: false,
      problems: [
        {
          code: "number_series_not_found",
          severity: "live",
          message: `Řada s ID ${configuredId} v iDokladu neexistuje (nebo patří jiné agendě).`,
        },
      ],
    };
  }
  const problems: InvoiceProblem[] = [];
  if (sequence.DocumentType !== ISSUED_INVOICE_DOCUMENT_TYPE) {
    problems.push({
      code: "number_series_wrong_type",
      severity: "live",
      message: `Řada ${configuredId} (${describe(sequence)}) není řada vydaných faktur.`,
    });
  }
  if (sequence.IsDefault) {
    problems.push({
      code: "number_series_is_default",
      severity: "live",
      message: `Řada ${configuredId} (${describe(sequence)}) je v iDokladu výchozí — tu používá B2B fakturace. E-shop potřebuje vlastní, nevýchozí řadu.`,
    });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, sequence, summary: describe(sequence) };
}
