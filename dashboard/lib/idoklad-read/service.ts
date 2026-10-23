// Čtení iDokladu — společné jádro pro MojeBegina, ChatGPT (Lucy) i Claude.
//
// JEDINÁ implementace čtení vydaných faktur, řad a auditu číslování. Volá
// ji runner (tools.ts: oprávnění, limit, auditní záznam) — stejně z UI
// MojeBegina i z MCP serveru. Žádná druhá integrace iDokladu nevzniká:
// přístupové údaje a HTTP klient jsou ty z lib/eshop/invoicing (jen na
// serveru), klient je VŽDY bez práva zápisu a navenek dává jen get/list.
//
// Ochrana osobních údajů: odběratel jen název/jméno, IČO, DIČ, obec
// (u firmy i ulice a PSČ). Nikdy e-mail, telefon, bankovní účet ani PDF.
import { andFilter, eqFilter, issuedInvoiceFilter, sinceDayFilter, type EshopIdokladClient } from "@/lib/eshop/invoicing/idokladHttp";
import { runNumberingAudit, type NumberingAuditResult } from "@/lib/eshop/invoicing/numberingAudit";
import { ISSUED_INVOICE_DOCUMENT_TYPE } from "@/lib/eshop/invoicing/numberSeries";
import { BEGINA_ICO } from "@/lib/eshop/invoicing/mode";
import { daysBetween, idokladDay, idokladUtc, pragueDateTime, pragueDay, todayPrague } from "./time";

/** Jen čtecí metody klienta — zápis tudy projít nemůže. */
export type IdokladReader = Pick<EshopIdokladClient, "get" | "list" | "requestCount" | "log">;

/** Nejvýš tolik stran (po 100) projde jedno hledání. */
export const SEARCH_MAX_PAGES = 10;
/** Nejdelší období hledání podle VS / zákazníka (iDoklad je filtrovat neumí — prochází se období). */
export const SEARCH_MAX_DAYS = 366;
/** Nejvýš tolik faktur vrátí jedno hledání. */
export const SEARCH_MAX_RESULTS = 100;

export class ReadInputError extends Error {}

// ------------------------------------------------------------------ typy iDokladu

type RawAddress = {
  NickName?: string | null;
  Firstname?: string | null;
  Surname?: string | null;
  IdentificationNumber?: string | null;
  VatIdentificationNumber?: string | null;
  Street?: string | null;
  City?: string | null;
  PostalCode?: string | null;
};
type RawItem = { Name?: string | null; Amount?: number | null; Unit?: string | null; UnitPrice?: number | null; Prices?: { TotalWithVat?: number | null } | null };
export type RawInvoice = {
  Id: number;
  DocumentNumber?: string | null;
  VariableSymbol?: string | null;
  OrderNumber?: string | null;
  Description?: string | null;
  DateOfIssue?: string | null;
  DateOfTaxing?: string | null;
  DateOfMaturity?: string | null;
  DateOfPayment?: string | null;
  PaymentStatus?: number | string | null;
  PartnerId?: number | null;
  PartnerAddress?: RawAddress | null;
  Prices?: { TotalWithVat?: number | null; TotalPaid?: number | null } | null;
  CurrencyId?: number | null;
  IsSentToPurchaser?: number | string | null;
  Items?: RawItem[] | null;
  Metadata?: { DateCreated?: string | null; DateLastChange?: string | null } | null;
};
type RawSequence = { Id: number; Name?: string | null; DocumentType?: number | string | null; IsDefault?: boolean | null; NumberFormat?: string | null };

// ------------------------------------------------------------------ výstup

export type PaymentState = "paid" | "unpaid" | "partially_paid" | "overpaid" | "unknown";

export type InvoiceSeries = { id: number; name: string; resolvedBy: "format" | "idoklad" } | null;

export type InvoiceSummary = {
  id: number;
  number: string;
  series: InvoiceSeries;
  variableSymbol: string | null;
  partner: { kind: "company" | "person"; name: string | null; ico: string | null; city: string | null };
  totalKc: number | null;
  paidKc: number | null;
  payment: PaymentState;
  dateOfIssue: string | null;
  dateOfTaxing: string | null;
  dateOfMaturity: string | null;
  /** null = iDoklad úhradu nemá (1753-01-01) */
  dateOfPayment: string | null;
  /** okamžik vytvoření v iDokladu, pražský čas */
  createdPrague: string | null;
  /** vytvořeno po datu vystavení (pražské dny); 0 = týž den */
  createdDaysAfterIssue: number | null;
  overdueDays: number | null;
};

export type InvoiceDetail = InvoiceSummary & {
  orderNumber: string | null;
  description: string | null;
  partnerAddress: { street: string | null; postalCode: string | null; city: string | null; dic: string | null } | null;
  items: { name: string; amount: number | null; unit: string | null; unitPriceKc: number | null; totalKc: number | null }[];
  createdUtc: string | null;
  lastChangePrague: string | null;
};

const PAYMENT_STATUS: Record<string, PaymentState> = {
  "0": "unpaid",
  Unpaid: "unpaid",
  "1": "paid",
  Paid: "paid",
  "2": "partially_paid",
  PartialPaid: "partially_paid",
  "3": "overpaid",
  Overpaid: "overpaid",
};

function partnerOf(raw: RawInvoice): InvoiceSummary["partner"] {
  const a = raw.PartnerAddress ?? {};
  const ico = a.IdentificationNumber?.replace(/\s/g, "") || null;
  const person = [a.Firstname, a.Surname].filter(Boolean).join(" ").trim();
  return { kind: ico ? "company" : "person", name: a.NickName?.trim() || person || null, ico, city: a.City?.trim() || null };
}

export function summarize(raw: RawInvoice, series: InvoiceSeries, today: string): InvoiceSummary {
  const created = idokladUtc(raw.Metadata?.DateCreated);
  const dateOfIssue = idokladDay(raw.DateOfIssue);
  const dateOfMaturity = idokladDay(raw.DateOfMaturity);
  const payment = PAYMENT_STATUS[String(raw.PaymentStatus)] ?? "unknown";
  const createdDay = created ? pragueDay(created) : null;
  return {
    id: raw.Id,
    number: (raw.DocumentNumber ?? "").trim(),
    series,
    variableSymbol: raw.VariableSymbol?.trim() || null,
    partner: partnerOf(raw),
    totalKc: typeof raw.Prices?.TotalWithVat === "number" ? raw.Prices.TotalWithVat : null,
    paidKc: typeof raw.Prices?.TotalPaid === "number" ? raw.Prices.TotalPaid : null,
    payment,
    dateOfIssue,
    dateOfTaxing: idokladDay(raw.DateOfTaxing),
    dateOfMaturity,
    dateOfPayment: idokladDay(raw.DateOfPayment),
    createdPrague: created ? pragueDateTime(created) : null,
    createdDaysAfterIssue: createdDay && dateOfIssue ? daysBetween(createdDay, dateOfIssue) : null,
    overdueDays: payment !== "paid" && payment !== "overpaid" && dateOfMaturity && dateOfMaturity < today ? daysBetween(today, dateOfMaturity) : null,
  };
}

// ------------------------------------------------------------------ řady

export type SeriesInfo = { id: number; name: string; isDefault: boolean; format: string | null; pattern: RegExp | null };

/** Formát řady iDokladu (např. „9{RR}{NNNN}“, „{RRRR}{NNNN}“) → regulární výraz čísla dokladu. */
export function seriesPattern(format: string | null): RegExp | null {
  if (!format) return null;
  let out = "";
  let rest = format;
  while (rest.length > 0) {
    const token = /^\{([A-Z])\1*\}/.exec(rest);
    if (token) {
      out += `\\d{${token[0].length - 2}}`;
      rest = rest.slice(token[0].length);
    } else {
      out += rest[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      rest = rest.slice(1);
    }
  }
  return new RegExp(`^${out}$`);
}

export async function loadSeries(client: IdokladReader): Promise<SeriesInfo[]> {
  const page = await client.list<RawSequence>("/NumericSequences", `DocumentType~eq~${ISSUED_INVOICE_DOCUMENT_TYPE}`);
  return page.Items.filter(
    (s) => s.DocumentType == null || s.DocumentType === ISSUED_INVOICE_DOCUMENT_TYPE || s.DocumentType === "IssuedInvoice"
  ).map((s) => ({ id: s.Id, name: s.Name?.trim() || `řada ${s.Id}`, isDefault: Boolean(s.IsDefault), format: s.NumberFormat ?? null, pattern: seriesPattern(s.NumberFormat ?? null) }));
}

/** Řada podle formátu čísla — jen když sedí právě na jednu řadu. */
export function seriesByFormat(number: string, series: SeriesInfo[]): InvoiceSeries {
  const matches = series.filter((s) => s.pattern?.test(number));
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name, resolvedBy: "format" } : null;
}

/** Řada ověřená v iDokladu: ((Id~eq~…)~and~(NumericSequenceId~eq~…)) pro každou řadu. */
async function confirmSeries(client: IdokladReader, invoiceId: number, series: SeriesInfo[]): Promise<InvoiceSeries> {
  for (const s of series) {
    const filter = issuedInvoiceFilter(andFilter(eqFilter("Id", String(invoiceId)), eqFilter("NumericSequenceId", String(s.id))));
    const found = (await client.list<{ Id: number }>("/IssuedInvoices", filter, 5)).Items.some((i) => i.Id === invoiceId);
    if (found) return { id: s.id, name: s.name, resolvedBy: "idoklad" };
  }
  return null;
}

// ------------------------------------------------------------------ agenda

/** Do jiné agendy než Begina se nečte. */
export async function assertBeginaAgenda(client: IdokladReader): Promise<void> {
  const agenda = await client.get<{ Contact?: { IdentificationNumber?: string | null } | null }>("/Account/CurrentAgenda");
  const ico = agenda?.Contact?.IdentificationNumber?.replace(/\s/g, "") ?? null;
  if (ico !== BEGINA_ICO) throw new ReadInputError(`Přihlášená agenda iDokladu má IČO ${ico ?? "neuvedeno"} — není to Begina.`);
}

// ------------------------------------------------------------------ hledání

export type SearchInput = {
  number?: string | null;
  variableSymbol?: string | null;
  ico?: string | null;
  customer?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  unpaidOnly?: boolean;
  limit?: number;
};

export type SearchResult = {
  invoices: InvoiceSummary[];
  /** true = výsledek je zkrácený (limit nebo strop stránek) */
  truncated: boolean;
  scanned: number;
  criteria: Record<string, unknown>;
  notes: string[];
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

async function pages(client: IdokladReader, filter: string, maxPages = SEARCH_MAX_PAGES): Promise<{ items: RawInvoice[]; truncated: boolean }> {
  const items: RawInvoice[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await client.list<RawInvoice>("/IssuedInvoices", filter, 100, page);
    items.push(...result.Items);
    if (page >= result.TotalPages || result.Items.length === 0) return { items, truncated: false };
  }
  return { items, truncated: true };
}

export async function searchInvoices(client: IdokladReader, input: SearchInput, now: Date = new Date()): Promise<SearchResult> {
  const today = todayPrague(now);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), SEARCH_MAX_RESULTS);
  const notes: string[] = [];
  const from = input.dateFrom ?? null;
  const to = input.dateTo ?? null;
  for (const d of [from, to]) if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ReadInputError("Datum ve tvaru YYYY-MM-DD.");
  if (from && to && to < from) throw new ReadInputError("Konec období je před začátkem.");
  if (!input.number && !input.variableSymbol && !input.ico && !input.customer && !from) {
    throw new ReadInputError("Zadejte číslo faktury, VS, IČO, zákazníka nebo období (date_from).");
  }

  await assertBeginaAgenda(client);
  const series = await loadSeries(client);
  let raw: RawInvoice[] = [];
  let truncated = false;

  if (input.number) {
    raw = (await client.list<RawInvoice>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("DocumentNumber", input.number)), 10)).Items;
  } else if (input.ico) {
    const contacts = (await client.list<{ Id: number; IdentificationNumber?: string | null }>("/Contacts", eqFilter("IdentificationNumber", input.ico), 20)).Items.filter(
      (c) => (c.IdentificationNumber ?? "").replace(/\s/g, "") === input.ico
    );
    if (contacts.length === 0) notes.push(`V adresáři iDokladu není kontakt s IČO ${input.ico}.`);
    for (const contact of contacts.slice(0, 5)) {
      const got = await pages(client, issuedInvoiceFilter(eqFilter("PartnerId", String(contact.Id))), 5);
      raw.push(...got.items);
      truncated ||= got.truncated;
    }
    if (contacts.length > 5) notes.push(`IČO ${input.ico} má v iDokladu ${contacts.length} kontaktů — prohledáno prvních 5.`);
  } else {
    // VS ani jméno odběratele iDoklad filtrovat neumí → období (nejvýš rok) a porovnání u nás
    if (!from) throw new ReadInputError("Hledání podle VS nebo zákazníka potřebuje období (date_from, nejvýš 366 dní).");
    const end = to ?? today;
    if (daysBetween(end, from) > SEARCH_MAX_DAYS) throw new ReadInputError(`Období nejvýš ${SEARCH_MAX_DAYS} dní.`);
    const got = await pages(client, issuedInvoiceFilter(sinceDayFilter("DateOfIssue", from)));
    raw = got.items;
    truncated = got.truncated;
    if (truncated) notes.push(`Prošlo se ${SEARCH_MAX_PAGES * 100} faktur od ${from} — zužte období.`);
  }

  const customer = input.customer ? fold(input.customer) : null;
  let rows = raw
    .map((r) => summarize(r, seriesByFormat((r.DocumentNumber ?? "").trim(), series), today))
    .filter((s) => !from || (s.dateOfIssue !== null && s.dateOfIssue >= from))
    .filter((s) => !to || (s.dateOfIssue !== null && s.dateOfIssue <= to))
    .filter((s) => !input.variableSymbol || s.variableSymbol === input.variableSymbol)
    .filter((s) => !customer || fold(s.partner.name ?? "").includes(customer))
    .filter((s) => !input.unpaidOnly || (s.payment !== "paid" && s.payment !== "overpaid"));
  rows.sort((a, b) => (b.dateOfIssue ?? "").localeCompare(a.dateOfIssue ?? "") || b.number.localeCompare(a.number, "cs", { numeric: true }));
  if (rows.length > limit) {
    truncated = true;
    rows = rows.slice(0, limit);
  }
  if (rows.some((r) => r.series === null)) notes.push("U některých čísel nejde řadu určit podle formátu — ověří ji detail faktury.");
  return {
    invoices: rows,
    truncated,
    scanned: raw.length,
    criteria: { number: input.number ?? null, variableSymbol: input.variableSymbol ?? null, ico: input.ico ?? null, customer: input.customer ?? null, dateFrom: from, dateTo: to, unpaidOnly: Boolean(input.unpaidOnly), limit },
    notes,
  };
}

// ------------------------------------------------------------------ detail

export async function getInvoice(client: IdokladReader, input: { number?: string | null; id?: number | null }, now: Date = new Date()): Promise<InvoiceDetail | null> {
  if (!input.number && !input.id) throw new ReadInputError("Zadejte číslo faktury nebo její ID v iDokladu.");
  await assertBeginaAgenda(client);
  let id = input.id ?? null;
  if (!id) {
    const found = (await client.list<RawInvoice>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("DocumentNumber", input.number!)), 5)).Items;
    if (found.length === 0) return null;
    if (found.length > 1) throw new ReadInputError(`Číslo ${input.number} je v iDokladu ${found.length}× — zadejte ID faktury (${found.map((f) => f.Id).join(", ")}).`);
    id = found[0].Id;
  }
  let raw: RawInvoice;
  try {
    raw = await client.get<RawInvoice>(`/IssuedInvoices/${id}`);
  } catch (error) {
    if (error instanceof Error && /: 404 /.test(error.message)) return null;
    throw error;
  }
  const series = await confirmSeries(client, raw.Id, await loadSeries(client));
  const summary = summarize(raw, series, todayPrague(now));
  const a = raw.PartnerAddress ?? null;
  const created = idokladUtc(raw.Metadata?.DateCreated);
  const changed = idokladUtc(raw.Metadata?.DateLastChange);
  return {
    ...summary,
    orderNumber: raw.OrderNumber?.trim() || null,
    description: raw.Description?.trim() || null,
    // ulice a PSČ jen u firmy (sídlo); u soukromé osoby jen obec
    partnerAddress: a
      ? {
          street: summary.partner.kind === "company" ? a.Street?.trim() || null : null,
          postalCode: summary.partner.kind === "company" ? a.PostalCode?.trim() || null : null,
          city: a.City?.trim() || null,
          dic: a.VatIdentificationNumber?.trim() || null,
        }
      : null,
    items: (raw.Items ?? []).map((item) => ({
      name: item.Name?.trim() ?? "",
      amount: typeof item.Amount === "number" ? item.Amount : null,
      unit: item.Unit?.trim() || null,
      unitPriceKc: typeof item.UnitPrice === "number" ? item.UnitPrice : null,
      totalKc: typeof item.Prices?.TotalWithVat === "number" ? item.Prices.TotalWithVat : null,
    })),
    createdUtc: created ? created.toISOString() : null,
    lastChangePrague: changed ? pragueDateTime(changed) : null,
  };
}

// ------------------------------------------------------------------ řady a audit

export async function numberingAudit(client: IdokladReader, input: { year: string; numbers: string[] }, now: Date = new Date()): Promise<NumberingAuditResult> {
  return runNumberingAudit(client as EshopIdokladClient, { ...input, now });
}

export type SeriesOverview = {
  year: string;
  series: NumberingAuditResult["series"];
  /** jen číslování: duplicity a mezery (datování je v auditu) */
  numbering: NumberingAuditResult["findings"];
  ok: boolean;
  error: string | null;
};

export async function listSeriesStatus(client: IdokladReader, year: string, now: Date = new Date()): Promise<SeriesOverview> {
  const audit = await numberingAudit(client, { year, numbers: [] }, now);
  return {
    year,
    series: audit.series,
    numbering: audit.findings.filter((f) => f.level === "error" || /chybí|je v řadě|ve více řadách|nekončí/.test(f.message)),
    ok: audit.ok,
    error: audit.error,
  };
}

// ------------------------------------------------------------------ neuhrazené a nesrovnalosti

export type MojeBeginaInvoice = { number: string; totalKc: number; paid: boolean; orderUrlPath: string | null };

export type Discrepancy = { kind: string; number: string | null; message: string };

export type UnpaidResult = {
  asOf: string;
  dateFrom: string;
  unpaid: InvoiceSummary[];
  discrepancies: Discrepancy[];
  truncated: boolean;
  scanned: number;
};

/**
 * Neuhrazené faktury od `dateFrom` a nesrovnalosti: po splatnosti,
 * částečně / přeplaceno, úhrada vyplněná u neuhrazené, vystaveno zpětně
 * (vytvořeno později než datum vystavení, pražské dny) a nesoulad s fakturami
 * vystavenými z MojeBegina (číslo, částka, úhrada).
 */
export async function unpaidAndDiscrepancies(
  client: IdokladReader,
  input: { dateFrom: string; mojeBegina: MojeBeginaInvoice[] },
  now: Date = new Date()
): Promise<UnpaidResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom)) throw new ReadInputError("date_from ve tvaru YYYY-MM-DD.");
  const today = todayPrague(now);
  if (daysBetween(today, input.dateFrom) > SEARCH_MAX_DAYS) throw new ReadInputError(`Období nejvýš ${SEARCH_MAX_DAYS} dní.`);
  await assertBeginaAgenda(client);
  const series = await loadSeries(client);
  const got = await pages(client, issuedInvoiceFilter(sinceDayFilter("DateOfIssue", input.dateFrom)));
  const all = got.items.map((r) => summarize(r, seriesByFormat((r.DocumentNumber ?? "").trim(), series), today));
  const discrepancies: Discrepancy[] = [];
  for (const s of all) {
    if (s.payment === "partially_paid") discrepancies.push({ kind: "partially_paid", number: s.number, message: `${s.number}: uhrazeno částečně (${s.paidKc ?? "—"} z ${s.totalKc ?? "—"} Kč).` });
    if (s.payment === "overpaid") discrepancies.push({ kind: "overpaid", number: s.number, message: `${s.number}: přeplaceno (${s.paidKc ?? "—"} z ${s.totalKc ?? "—"} Kč).` });
    if (s.payment === "unpaid" && s.dateOfPayment) discrepancies.push({ kind: "payment_date_unpaid", number: s.number, message: `${s.number}: neuhrazená, ale má datum úhrady ${s.dateOfPayment}.` });
    if (s.createdDaysAfterIssue !== null && s.createdDaysAfterIssue > 0) {
      discrepancies.push({
        kind: "backdated",
        number: s.number,
        message: `${s.number}: datum vystavení ${s.dateOfIssue}, vytvořena ${s.createdPrague} (pražský čas, o ${s.createdDaysAfterIssue} d později).`,
      });
    }
  }
  const byNumber = new Map(all.map((s) => [s.number, s]));
  for (const m of input.mojeBegina) {
    const s = byNumber.get(m.number);
    if (!s) {
      if (!got.truncated) discrepancies.push({ kind: "missing_in_idoklad", number: m.number, message: `${m.number}: vystavená z MojeBegina, v iDokladu od ${input.dateFrom} nenalezena.` });
      continue;
    }
    if (s.totalKc !== null && Math.abs(s.totalKc - m.totalKc) >= 0.005) {
      discrepancies.push({ kind: "amount_mismatch", number: m.number, message: `${m.number}: MojeBegina ${m.totalKc} Kč, iDoklad ${s.totalKc} Kč.` });
    }
    if (m.paid && s.payment !== "paid" && s.payment !== "overpaid") {
      discrepancies.push({ kind: "paid_mismatch", number: m.number, message: `${m.number}: v MojeBegina uhrazená, v iDokladu ${s.payment}.` });
    }
  }
  const unpaid = all
    .filter((s) => s.payment !== "paid" && s.payment !== "overpaid")
    .sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1) || (a.dateOfIssue ?? "").localeCompare(b.dateOfIssue ?? ""));
  return { asOf: today, dateFrom: input.dateFrom, unpaid, discrepancies, truncated: got.truncated, scanned: all.length };
}
