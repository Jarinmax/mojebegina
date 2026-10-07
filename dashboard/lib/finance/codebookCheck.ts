// Finance 1.0 — read-only ověření číselníků iDokladu pro ostré vystavování
// e-shopových faktur (bod 3, schváleno vedením 7. 10. 2026).
//
// Jen GET (pojistka klienta). Nic se nezakládá, nemění ani neukládá do DB:
//   • GET /PaymentOptions                — způsoby úhrady (převod / karta / hotově),
//   • GET /Currencies?filter=Code~eq~CZK — ID české koruny,
//   • GET /Countries?filter=Code~eq~CZ   — ID České republiky,
//   • GET /IssuedInvoices/Default        — výchozí faktura agendy (typ ceny
//                                          a sazba položek u neplátce, účet…),
//   • GET /NumericSequences/DocumentNumbers/IssuedInvoice
//       ?numericSequenceId=7277293&date=… — další číslo v řadě E-shop Begina
//       (jen náhled — číslo se tím NErezervuje).
// Údaje z agendy (preferovaný typ ceny, sazba, plátce DPH, výchozí měna)
// přicházejí z už načtené GET /Account/CurrentAgenda.
//
// OPRAVA 7. 10. 2026 (zjištěno živým read-only testem proti agendě Beginy):
//   • Countries.Code je ISO ALPHA-2 ("CZ"), ne ALPHA-3 ("CZE") — doc komentář
//     v CountryListGetModel.cs oficiálního SDK (Solitea/IdokladSdk) tvrdí
//     ALPHA-3, ale vlastní integrační test SDK (CountryTests.cs) filtruje
//     `Code.IsEqual("CZ")` a prochází proti živému API — kód věří testu,
//     ne komentáři. Dřív použité „CZE“ proto v reálné agendě nikdy nic
//     nenašlo (nulová shoda), i když číslo samo bylo v pořádku.
//   • PaymentOptionListGetModel (oficiální SDK) nemá ŽÁDNÝ enum/typ pole —
//     jen Id (pořadí vzniku v konkrétní agendě, NENÍ přes agendy stejné;
//     v Begině je výchozí/bankovní převod ID 1, v testovací agendě SDK
//     samotného je defaultní jiné ID), Code a Name (obojí prostý text,
//     oboje uživatel v iDokladu může přejmenovat). ŽÁDNÉ z toho není
//     garantované API kontraktem. Name navíc není ani jazykově stabilní —
//     agenda Beginy vrací anglicky „Bank transfer“/„Credit card“/„Cash“,
//     ne česky „Převodem“/„Kartou“/„Hotově“, jak se čekalo. Párování proto
//     místo dřívější úzké české regulární hlídky používá širší vzor
//     pokrývající obě jazykové varianty — a pořád vyžaduje ROVNĚ JEDNU
//     shodu (víc nebo žádná shoda = viditelně červeně, nikdy tiché
//     uhodnutí). Code se záměrně nepoužívá jako rozhodující pole — mezi
//     testovací fixturou (K pro kartu) a reálnou agendou Beginy (P pro
//     kartu) se liší, takže není spolehlivější než rozšířený název.
//
// Párování způsobů úhrady je STEJNÉ jako v ostrém vystavení e-shopu
// (větev claude/great-bell-ffjwo3, lib/eshop/invoicing/idoklad.ts
// PAYMENT_OPTION_MATCH) — test tak ověří, že e-shop najde právě jeden.
import type { IdokladClient } from "./idoklad/client";
import { IdokladError } from "./idoklad/errors";

export const ESHOP_SEQUENCE_ID = 7277293;
export const CZECH_REPUBLIC_COUNTRY_CODE = "CZ";

export const ESHOP_PAYMENT_METHODS = [
  { method: "bank_transfer", label: "převodem", name: /(p[řr]evod|bank\s*transfer|wire\s*transfer)/i },
  { method: "card", label: "kartou", name: /(kart|card)/i },
  { method: "cash", label: "hotově", name: /(hotov|\bcash\b)/i },
] as const;

const PRICE_TYPES: Record<string, string> = {
  "0": "s DPH (WithVat)",
  "1": "bez DPH (WithoutVat)",
  "2": "jen základ (OnlyBase)",
  WithVat: "s DPH (WithVat)",
  WithoutVat: "bez DPH (WithoutVat)",
  OnlyBase: "jen základ (OnlyBase)",
};
const VAT_RATE_TYPES: Record<string, string> = {
  "0": "snížená 1 (Reduced1)",
  "1": "základní (Basic)",
  "2": "nulová (Zero)",
  "3": "snížená 2 (Reduced2)",
  Reduced1: "snížená 1 (Reduced1)",
  Basic: "základní (Basic)",
  Zero: "nulová (Zero)",
  Reduced2: "snížená 2 (Reduced2)",
};

export function priceTypeLabel(value: string | null): string {
  return value === null ? "neuvedeno" : (PRICE_TYPES[value] ?? `typ ${value}`);
}

export function vatRateTypeLabel(value: string | null): string {
  return value === null ? "neuvedeno" : (VAT_RATE_TYPES[value] ?? `typ ${value}`);
}

type ApiEnumValue = number | string | null | undefined;
const enumText = (v: ApiEnumValue) => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const cap = (v: unknown, max: number) => (typeof v === "string" ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : null);

export type CodebookCheck = {
  agenda: { preferredPriceType: string | null; preferredVatRate: string | null; isVatPayer: boolean | null; defaultCurrencyId: number | null };
  czk: { id: number | null; code: string | null; name: string | null }[] | null;
  cze: { id: number | null; code: string | null; name: string | null }[] | null;
  paymentOptions: { id: number | null; name: string | null; code: string | null; isDefault: boolean | null }[] | null;
  /** jak by e-shop spároval své způsoby úhrady (ids = nalezené řádky) */
  methods: { method: string; label: string; ids: number[] }[];
  defaultInvoice: {
    currencyId: number | null;
    paymentOptionId: number | null;
    itemPriceType: string | null;
    itemVatRateType: string | null;
    itemVatRate: number | null;
    hasItem: boolean;
    hasBankAccount: boolean;
    isIncomeTax: boolean | null;
  } | null;
  nextEshopNumber: { documentNumber: string | null; serial: number | null; sequenceId: number | null } | null;
  /** chyby jednotlivých dotazů (nefatální) */
  errors: string[];
};

type AgendaLike = {
  PreferredPriceType?: ApiEnumValue;
  PreferredVatRate?: ApiEnumValue;
  IsRegisteredForVat?: boolean | null;
  DefaultCurrencyId?: number | null;
};

const FATAL = ["auth_failed", "rate_limited", "budget_exhausted", "request_blocked", "api_not_allowed", "billing"];

export async function runCodebookCheck(client: IdokladClient, agenda: AgendaLike, today: string): Promise<CodebookCheck> {
  const errors: string[] = [];
  async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof IdokladError) {
        if (FATAL.includes(error.code)) throw error;
        errors.push(`${label}: ${error.userMessage}`);
        return null;
      }
      throw error;
    }
  }

  const payment = await attempt("Způsoby úhrady", () =>
    client.getPage<{ Id?: number; Name?: string; Code?: string; IsDefault?: boolean }>("PaymentOptions", 1, { pageSize: 100 })
  );
  const currencies = await attempt("Měny", () =>
    client.getPage<{ Id?: number; Code?: string; Name?: string }>("Currencies", 1, { pageSize: 10, filter: "Code~eq~CZK" })
  );
  const countries = await attempt("Země", () =>
    client.getPage<{ Id?: number; Code?: string; Name?: string }>("Countries", 1, {
      pageSize: 10,
      filter: `Code~eq~${CZECH_REPUBLIC_COUNTRY_CODE}`,
    })
  );
  const defaults = await attempt("Výchozí faktura", () => client.get<Record<string, unknown>>("/IssuedInvoices/Default"));
  const numbers = await attempt("Další číslo v řadě E-shop Begina", () =>
    client.get<{ Unique?: { DocumentNumber?: string; DocumentSerialNumber?: number; NumericSequenceId?: number } | null }>(
      "/NumericSequences/DocumentNumbers/IssuedInvoice",
      { date: today, numericSequenceId: String(ESHOP_SEQUENCE_ID) }
    )
  );

  const paymentOptions =
    payment?.items.slice(0, 15).map((o) => ({
      id: numOrNull(o.Id),
      name: cap(o.Name, 30),
      code: cap(o.Code, 10),
      isDefault: typeof o.IsDefault === "boolean" ? o.IsDefault : null,
    })) ?? null;
  const methods = ESHOP_PAYMENT_METHODS.map((m) => ({
    method: m.method,
    label: m.label,
    ids: (payment?.items ?? []).filter((o) => m.name.test(o.Name ?? "")).map((o) => numOrNull(o.Id) ?? -1),
  }));
  const pick = (rows: { Id?: number; Code?: string; Name?: string }[] | undefined) =>
    rows?.slice(0, 3).map((r) => ({ id: numOrNull(r.Id), code: cap(r.Code, 5), name: cap(r.Name, 30) })) ?? null;

  const item = Array.isArray(defaults?.Items) ? (defaults!.Items[0] as Record<string, unknown> | undefined) : undefined;
  const unique = numbers?.Unique ?? null;

  return {
    agenda: {
      preferredPriceType: enumText(agenda.PreferredPriceType),
      preferredVatRate: enumText(agenda.PreferredVatRate),
      isVatPayer: typeof agenda.IsRegisteredForVat === "boolean" ? agenda.IsRegisteredForVat : null,
      defaultCurrencyId: numOrNull(agenda.DefaultCurrencyId),
    },
    czk: pick(currencies?.items),
    cze: pick(countries?.items),
    paymentOptions,
    methods,
    defaultInvoice: defaults
      ? {
          currencyId: numOrNull(defaults.CurrencyId),
          paymentOptionId: numOrNull(defaults.PaymentOptionId),
          itemPriceType: enumText(item?.PriceType as ApiEnumValue),
          itemVatRateType: enumText(item?.VatRateType as ApiEnumValue),
          itemVatRate: numOrNull(item?.VatRate),
          hasItem: Boolean(item),
          hasBankAccount: Boolean(defaults.AccountNumber || defaults.Iban || defaults.BankId),
          isIncomeTax: typeof defaults.IsIncomeTax === "boolean" ? defaults.IsIncomeTax : null,
        }
      : null,
    nextEshopNumber: unique
      ? {
          documentNumber: cap(unique.DocumentNumber, 20),
          serial: numOrNull(unique.DocumentSerialNumber),
          sequenceId: numOrNull(unique.NumericSequenceId),
        }
      : null,
    errors: errors.map((e) => e.slice(0, 160)).slice(0, 5),
  };
}
