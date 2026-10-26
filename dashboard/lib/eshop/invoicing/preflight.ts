// ESHOP 1.0 — kontrola iDokladu PŘED vystavením faktury (preflight). Jen čtení.
//
// Jediné místo, kde se ověřuje agenda, číselníky a řada. Používá ho:
//   • ostré vystavení (issue.ts) — před KAŽDÝM pokusem, stejným klientem
//     a stejnými Client Credentials; jakákoli neúspěšná kontrola = faktura
//     se nevystaví (žádné varování, které by šlo přeskočit),
//   • stránka „Kontrola připojení iDokladu“ v MojeBegina — ruční spuštění
//     s Production přístupovými údaji ještě před zapnutím fakturace.
//
// Volá výhradně GET (a POST pro získání tokenu na identity server):
//   GET /Account/CurrentAgenda                       agenda: IČO, neplátce DPH, typ ceny
//   GET /Currencies?filter=Code~eq~CZK               ID české koruny
//   GET /Countries?filter=Code~eq~CZ                 ID České republiky (ISO alpha-2)
//   GET /PaymentOptions                              převod / karta / hotově (ne dobírka)
//   GET /NumericSequences?filter=DocumentType~eq~0   řada 7277293 „E-shop Begina“
//   GET /NumericSequences/DocumentNumbers/IssuedInvoice  další číslo (jen náhled)
//   GET /IssuedInvoices?filter=NumericSequenceId~eq~…  doklady v řadě (formát, jedinečnost)
//   GET /IssuedInvoices?filter=DocumentNumber~eq~…     poslední a další číslo napříč agendou
//   GET /IssuedInvoices/Default                      šablona faktury (typ ceny, účet)
// Nic nezakládá, nemění, nerezervuje ani neodesílá.
import { CZECH_REPUBLIC_COUNTRY_CODE, IDOKLAD_ENUMS, PAYMENT_OPTION_MATCH, type ItemPricing } from "./idoklad";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError, eqFilter, issuedInvoiceFilter, type IdokladLogEntry } from "./idokladHttp";
import { BEGINA_ICO, ESHOP_SERIES, eshopIdokladCredentials, missingIdokladCredentials } from "./mode";
import { ISSUED_INVOICE_DOCUMENT_TYPE, checkEshopSeries, parseSeriesId, type IdokladNumericSequence } from "./numberSeries";

/**
 * Číslo faktury v řadě 9{RR}{NNNN}: 9 + rok (2 číslice) + pořadí (4 číslice).
 * Ruční řada Lucie (2026xxxx, výchozí řada agendy) tvaru nevyhoví — MojeBegina
 * ji proto nikdy nepoužije ani nepřevezme (dvě souběžné řady od 20. 10. 2026).
 */
export const ESHOP_NUMBER_RE = /^9\d{2}\d{4}$/;

/** Nejvýš tolik stran (po 100) dokladů řady E-shop Begina projde kontrola řady. */
const SERIES_DOCUMENT_PAGES = 10;

export type PreflightCheckKey =
  | "auth"
  | "agenda"
  | "vat"
  | "currency"
  | "country"
  | "payment_bank_transfer"
  | "payment_card"
  | "payment_cash"
  | "series"
  | "next_number"
  | "series_documents"
  | "pricing";

export type PreflightCheck = { key: PreflightCheckKey; label: string; ok: boolean; detail: string };

export type PreflightResolved = {
  currencyId: number;
  countryId: number;
  /** způsob úhrady MojeBegina (bank_transfer / card / cash) → ID v iDokladu */
  paymentOptionIds: Record<string, number>;
  sequence: { id: number; name: string };
  next: { documentNumber: string; serial: number; day: string };
  pricing: ItemPricing;
  /** výchozí faktura agendy (účet, konstantní symbol…) pro tělo faktury */
  defaults: Record<string, unknown>;
};

export type PreflightResult = {
  /** true jen když prošly VŠECHNY kontroly */
  ok: boolean;
  checkedAt: string;
  checks: PreflightCheck[];
  /** hodnoty pro vystavení — jen při ok */
  resolved: PreflightResolved | null;
  requestCount: number;
  /** průběh požadavků (metoda, cesta, HTTP stav / null = bez odpovědi, ms) — bez tokenu a údajů */
  requests: IdokladLogEntry[];
};

const LABELS: Record<PreflightCheckKey, string> = {
  auth: "Přihlášení (Client Credentials)",
  agenda: `Agenda Begina (IČO ${BEGINA_ICO})`,
  vat: "Neplátce DPH",
  currency: "Měna CZK",
  country: "Česká republika (CZ)",
  payment_bank_transfer: "Způsob úhrady převodem (Bank transfer)",
  payment_card: "Způsob úhrady kartou (Credit card)",
  payment_cash: "Způsob úhrady hotově (Cash, ne dobírka)",
  series: `Řada ${ESHOP_SERIES.id} „${ESHOP_SERIES.name}“ (vydané faktury, není výchozí)`,
  next_number: "Další číslo v řadě (jen náhled)",
  series_documents: "Doklady v řadě E-shop Begina (formát 9RRNNNN, čísla jedinečná, další číslo volné)",
  pricing: "Typ ceny položek u neplátce",
};

/** Pořadí kontrol (stejné na stránce i ve výsledku). */
export const PREFLIGHT_KEYS = Object.keys(LABELS) as PreflightCheckKey[];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function documentTypeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === "IssuedInvoice") return ISSUED_INVOICE_DOCUMENT_TYPE;
  return -1;
}

const PRICE_TYPE_NAMES: Record<number, string> = { 0: "WithVat", 1: "WithoutVat", 2: "OnlyBase" };
const PRICE_TYPE_BY_NAME: Record<string, number> = { WithVat: 0, WithoutVat: 1, OnlyBase: 2 };
const VAT_RATE_TYPE_BY_NAME: Record<string, number> = { Reduced1: 0, Basic: 1, Zero: 2, Reduced2: 3 };

function enumNumber(value: unknown, byName: Record<string, number>): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value in byName) return byName[value];
  return null;
}

function message(error: unknown): string {
  if (error instanceof IdokladApiError || error instanceof IdokladBlockedError) return error.message;
  return `Neočekávaná chyba: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Spustí všechny kontroly (jen čtení). Každá chyba = neúspěšná kontrola;
 * výsledek `ok` je true jen když prošlo všechno. Nikdy nevyhazuje výjimku.
 */
export async function runIdokladPreflight(
  client: EshopIdokladClient,
  options: { seriesId: string; day: string; now?: Date }
): Promise<PreflightResult> {
  const results = new Map<PreflightCheckKey, PreflightCheck>();
  const pass = (key: PreflightCheckKey, detail: string) => results.set(key, { key, label: LABELS[key], ok: true, detail });
  const fail = (key: PreflightCheckKey, detail: string) => results.set(key, { key, label: LABELS[key], ok: false, detail });
  const finish = (resolved: PreflightResolved | null): PreflightResult => {
    const checks = PREFLIGHT_KEYS.map(
      (key) => results.get(key) ?? { key, label: LABELS[key], ok: false, detail: "Neověřeno — předchozí kontrola selhala." }
    );
    const ok = checks.every((c) => c.ok) && resolved !== null;
    const requests = [...client.log];
    // do runtime logů Vercelu: jen metoda, cesta, stav a čas (nic tajného)
    if (!ok) console.warn("iDoklad preflight neprošel", JSON.stringify(requests));
    return {
      ok,
      checkedAt: (options.now ?? new Date()).toISOString(),
      checks,
      resolved: ok ? resolved : null,
      requestCount: client.requestCount,
      requests,
    };
  };

  // 1. přihlášení + agenda (první požadavek si vyžádá token)
  let agenda: {
    IsRegisteredForVat?: boolean | null;
    PreferredPriceType?: number | string | null;
    Contact?: { IdentificationNumber?: string | null } | null;
  };
  try {
    agenda = await client.get("/Account/CurrentAgenda");
  } catch (error) {
    if (!client.authenticated) {
      fail("auth", message(error));
    } else {
      pass("auth", "Token získán.");
      fail("agenda", message(error));
    }
    return finish(null);
  }
  pass("auth", "Token získán.");
  const ico = agenda?.Contact?.IdentificationNumber?.replace(/\s/g, "") ?? null;
  if (ico === BEGINA_ICO) pass("agenda", `IČO ${ico}`);
  else fail("agenda", `Přihlášená agenda má IČO ${ico ?? "neuvedeno"} — není to Begina.`);
  if (agenda?.IsRegisteredForVat === false) pass("vat", "Agenda je neplátce DPH.");
  else fail("vat", agenda?.IsRegisteredForVat === true ? "Agenda je vedená jako plátce DPH." : "iDoklad neuvedl režim DPH.");

  // 2. měna CZK
  let currencyId: number | null = null;
  try {
    const page = await client.list<{ Id: number; Code?: string | null }>("/Currencies", eqFilter("Code", "CZK"), 5);
    const czk = page.Items.filter((c) => c.Code === "CZK");
    if (czk.length === 1 && num(czk[0].Id) !== null) {
      currencyId = czk[0].Id;
      pass("currency", `ID ${currencyId}`);
    } else fail("currency", `Nalezeno ${czk.length} záznamů CZK (musí být právě jeden).`);
  } catch (error) {
    fail("currency", message(error));
  }

  // 3. Česká republika
  let countryId: number | null = null;
  try {
    const page = await client.list<{ Id: number; Code?: string | null }>("/Countries", eqFilter("Code", CZECH_REPUBLIC_COUNTRY_CODE), 5);
    const cz = page.Items.filter((c) => c.Code === CZECH_REPUBLIC_COUNTRY_CODE);
    if (cz.length === 1 && num(cz[0].Id) !== null) {
      countryId = cz[0].Id;
      pass("country", `ID ${countryId}`);
    } else fail("country", `Nalezeno ${cz.length} záznamů CZ (musí být právě jeden).`);
  } catch (error) {
    fail("country", message(error));
  }

  // 4. způsoby úhrady — každý právě jeden, dobírka vyloučená
  const paymentOptionIds: Record<string, number> = {};
  try {
    const page = await client.list<{ Id: number; Name?: string | null }>("/PaymentOptions");
    for (const [method, key] of [
      ["bank_transfer", "payment_bank_transfer"],
      ["card", "payment_card"],
      ["cash", "payment_cash"],
    ] as const) {
      const rule = PAYMENT_OPTION_MATCH[method];
      const matches = page.Items.filter((o) => rule.name.test(o.Name ?? "") && !rule.exclude.test(o.Name ?? ""));
      const excluded = page.Items.filter((o) => rule.name.test(o.Name ?? "") && rule.exclude.test(o.Name ?? ""));
      const note = excluded.length ? ` (vyloučeno: ${excluded.map((o) => `„${o.Name}“ ID ${o.Id}`).join(", ")})` : "";
      if (matches.length === 1 && num(matches[0].Id) !== null) {
        paymentOptionIds[method] = matches[0].Id;
        pass(key, `„${matches[0].Name}“ ID ${matches[0].Id}${note}`);
      } else {
        fail(
          key,
          `Nalezeno ${matches.length}${matches.length ? ` (${matches.map((o) => `„${o.Name}“ ID ${o.Id}`).join(", ")})` : ""} — musí být právě jeden${note}.`
        );
      }
    }
  } catch (error) {
    for (const key of ["payment_bank_transfer", "payment_card", "payment_cash"] as const) fail(key, message(error));
  }

  // 5. řada 7277293
  let sequence: IdokladNumericSequence | null = null;
  try {
    const page = await client.list<IdokladNumericSequence>("/NumericSequences", `DocumentType~eq~${ISSUED_INVOICE_DOCUMENT_TYPE}`);
    const sequences = page.Items.map((s) => ({ ...s, DocumentType: documentTypeNumber(s.DocumentType) }));
    if (options.seriesId !== ESHOP_SERIES.id) {
      fail("series", `Nastavená řada ${options.seriesId || "—"} není ${ESHOP_SERIES.id}.`);
    } else {
      const check = checkEshopSeries(options.seriesId, sequences);
      if (!check.ok) fail("series", check.problems.map((p) => p.message).join(" "));
      else if ((check.sequence.Name ?? "").trim().toLowerCase() !== ESHOP_SERIES.name.toLowerCase()) {
        fail("series", `Řada ${options.seriesId} se v iDokladu jmenuje „${check.sequence.Name ?? ""}“, ne „${ESHOP_SERIES.name}“.`);
      } else {
        sequence = check.sequence;
        pass("series", `${check.sequence.Name}, formát ${check.sequence.NumberFormat ?? "—"}, vydané faktury, není výchozí`);
      }
    }
  } catch (error) {
    fail("series", message(error));
  }

  // 6. další číslo (jen náhled, nic se nerezervuje)
  let next: PreflightResolved["next"] | null = null;
  try {
    const numbers = await client.get<{
      Unique?: { DocumentSerialNumber?: number; DocumentNumber?: string; NumericSequenceId?: number } | null;
    }>("/NumericSequences/DocumentNumbers/IssuedInvoice", { date: options.day, numericSequenceId: ESHOP_SERIES.id });
    const unique = numbers?.Unique;
    if (!unique || String(unique.NumericSequenceId) !== ESHOP_SERIES.id || typeof unique.DocumentSerialNumber !== "number") {
      fail("next_number", `iDoklad nevrátil další číslo v řadě ${ESHOP_SERIES.id}.`);
    } else if (!unique.DocumentNumber || !ESHOP_NUMBER_RE.test(unique.DocumentNumber)) {
      fail("next_number", `Další číslo „${unique.DocumentNumber ?? "—"}“ neodpovídá formátu 9{RR}{NNNN}.`);
    } else if (!unique.DocumentNumber.startsWith(`9${options.day.slice(2, 4)}`)) {
      fail("next_number", `Další číslo ${unique.DocumentNumber} nemá rok ${options.day.slice(0, 4)} (9${options.day.slice(2, 4)}NNNN).`);
    } else {
      next = { documentNumber: unique.DocumentNumber, serial: unique.DocumentSerialNumber, day: options.day };
      pass("next_number", `${unique.DocumentNumber} (pořadí ${unique.DocumentSerialNumber}, ${options.day})`);
    }
  } catch (error) {
    fail("next_number", message(error));
  }

  // 7. doklady v řadě: každý číslo 9RRNNNN, žádné číslo dvakrát, další číslo
  //    ještě nikde v agendě není; poslední číslo řady je v agendě jen jednou
  if (next) {
    try {
      const filter = issuedInvoiceFilter(eqFilter("NumericSequenceId", ESHOP_SERIES.id));
      const documents: { Id: number; DocumentNumber?: string | null }[] = [];
      let tooMany = false;
      for (let page = 1; page <= SERIES_DOCUMENT_PAGES; page += 1) {
        const result = await client.list<{ Id: number; DocumentNumber?: string | null }>("/IssuedInvoices", filter, 100, page);
        documents.push(...result.Items);
        if (page >= result.TotalPages || result.Items.length === 0) break;
        if (page === SERIES_DOCUMENT_PAGES) tooMany = true;
      }
      const numbers = documents.map((d) => (d.DocumentNumber ?? "").trim());
      const foreign = numbers.filter((n) => !ESHOP_NUMBER_RE.test(n));
      const duplicates = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))];
      const last = [...numbers].filter((n) => ESHOP_NUMBER_RE.test(n)).sort().at(-1) ?? null;
      const nextUsed = (await client.list<{ Id: number }>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("DocumentNumber", next.documentNumber)), 5)).Items.length;
      const lastCount = last
        ? (await client.list<{ Id: number }>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("DocumentNumber", last)), 5)).Items.length
        : 0;
      if (tooMany) {
        fail("series_documents", `V řadě je víc než ${SERIES_DOCUMENT_PAGES * 100} dokladů — ověřit ručně.`);
      } else if (foreign.length > 0) {
        fail("series_documents", `V řadě ${ESHOP_SERIES.id} jsou doklady s cizím číslem: ${foreign.slice(0, 5).join(", ") || "bez čísla"}.`);
      } else if (duplicates.length > 0) {
        fail("series_documents", `Číslo ${duplicates.join(", ")} je v řadě víckrát.`);
      } else if (numbers.includes(next.documentNumber) || nextUsed > 0) {
        fail("series_documents", `Další číslo ${next.documentNumber} už v iDokladu existuje.`);
      } else if (last && lastCount !== 1) {
        fail("series_documents", `Číslo ${last} je v iDokladu ${lastCount}× (musí být jednou).`);
      } else {
        pass(
          "series_documents",
          `${numbers.length} ${numbers.length === 1 ? "doklad" : numbers.length >= 2 && numbers.length <= 4 ? "doklady" : "dokladů"}` +
            `${last ? `, poslední ${last} (v agendě jednou)` : ""}; další ${next.documentNumber} je volné`
        );
      }
    } catch (error) {
      fail("series_documents", message(error));
    }
  }

  // 8. typ ceny a sazba položek z výchozí faktury agendy
  let pricing: ItemPricing | null = null;
  let defaults: Record<string, unknown> = {};
  try {
    defaults = (await client.get<Record<string, unknown>>("/IssuedInvoices/Default")) ?? {};
    const item = Array.isArray(defaults.Items) ? (defaults.Items[0] as Record<string, unknown> | undefined) : undefined;
    const priceType = enumNumber(item?.PriceType, PRICE_TYPE_BY_NAME) ?? enumNumber(agenda?.PreferredPriceType, PRICE_TYPE_BY_NAME);
    const vatRateType = enumNumber(item?.VatRateType, VAT_RATE_TYPE_BY_NAME) ?? IDOKLAD_ENUMS.VatRateType.Zero;
    if (priceType === null || !(priceType in PRICE_TYPE_NAMES)) {
      fail("pricing", "iDoklad neuvedl typ ceny (výchozí faktura ani agenda).");
    } else {
      pricing = { priceType, vatRateType };
      pass("pricing", `${PRICE_TYPE_NAMES[priceType]} (${priceType}), sazba typu ${vatRateType}`);
    }
  } catch (error) {
    fail("pricing", message(error));
  }

  if (
    currencyId === null ||
    countryId === null ||
    !sequence ||
    !next ||
    !pricing ||
    Object.keys(paymentOptionIds).length !== 3 ||
    !results.get("series_documents")?.ok
  ) {
    return finish(null);
  }
  return finish({
    currencyId,
    countryId,
    paymentOptionIds,
    sequence: { id: sequence.Id, name: sequence.Name ?? "" },
    next,
    pricing,
    defaults,
  });
}

/** Krátký souhrn neúspěšných kontrol (do chyby vystavení). */
export function preflightFailureSummary(result: PreflightResult): string {
  const failed = result.checks.filter((c) => !c.ok);
  return `Kontrola iDokladu před vystavením neprošla — faktura se nevystavila: ${failed
    .map((c) => `${c.label}: ${c.detail}`)
    .join(" · ")}`;
}

/**
 * Ruční kontrola připojení (MojeBegina): stejné Client Credentials jako
 * ostré vystavení (IDOKLAD_ESHOP_CLIENT_ID/SECRET), ale klient BEZ práva
 * zápisu (writesAllowed: false) — i kdyby kontrola omylem chtěla zapsat,
 * pojistka v idokladHttp.ts to zablokuje před odesláním. Funguje
 * nezávisle na přepínači IDOKLAD_INVOICING_ENABLED (jde spustit dřív, než
 * se fakturace zapne).
 */
export async function runPreflightFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<{ ok: true; result: PreflightResult } | { ok: false; error: string }> {
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) {
    return { ok: false, error: `Chybí přístupové údaje k iDokladu (${missingIdokladCredentials(env).join(", ")}) — kontrola nic nevolala.` };
  }
  const now = options.now ?? new Date();
  const client = new EshopIdokladClient({
    ...credentials,
    writesAllowed: false,
    env,
    fetchImpl: options.fetchImpl,
  });
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
  const seriesId = parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID).id ?? "";
  return { ok: true, result: await runIdokladPreflight(client, { seriesId, day, now }) };
}
