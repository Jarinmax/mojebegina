// B2B faktura z MojeBegina do iDokladu — Luciina ruční řada 2026xxxx
// (rozhodnutí majitele 1. 11. 2026). Pro faktury BEZ e-shopu: odběratel podle
// IČO, libovolné položky, hotově / převodem / kartou, otevřená (neuhrazená)
// nebo hned uhrazená, splatnost a vlastní poznámka.
//
// Žádná druhá integrace iDokladu: stejný klient (EshopIdokladClient), stejná
// kontrola před vystavením (runIdokladPreflight, profil „b2b“), stejné
// číselníky a stejná brána ostrého provozu (liveInvoicingGate: Production +
// IDOKLAD_INVOICING_ENABLED manual/on). Navíc musí být nastavená řada
// IDOKLAD_B2B_SEQUENCE_ID — a klient pro B2B smí zapsat fakturu JEN do ní
// (assertB2bSeriesBody); e-shop a automat zůstávají výhradně v 7277293.
//
// Postup: prepareB2bInvoice (jen čtení) → uživatel potvrdí → issueB2bInvoice
// se stejným otiskem (fingerprint). Pojistka proti dvojí faktuře: stejný
// odběratel + stejná částka v okně ±7 dní = jen s výslovným potvrzením.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { IDOKLAD_ENUMS, idokladDate, type ItemPricing } from "./idoklad";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError, eqFilter, issuedInvoiceFilter } from "./idokladHttp";
import { ESHOP_SERIES, eshopIdokladCredentials, liveInvoicingGate } from "./mode";
import { B2B_NUMBER_RE, preflightFailureSummary, runIdokladPreflight, type PreflightResolved } from "./preflight";
import { addDays, b2bWarnings, B2B_PAYMENT_LABELS, type B2bInvoiceInput } from "./b2bInvoiceValidation";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const B2B_DUPLICATE_DAYS = 7;

/** Řada pro B2B faktury z MojeBegina (Luciina ruční) — jen výslovně nastavená, nikdy 7277293. */
export function b2bSeriesId(env: Env = process.env): string | null {
  const id = env.IDOKLAD_B2B_SEQUENCE_ID?.trim() ?? "";
  return /^[1-9]\d{0,9}$/.test(id) && id !== ESHOP_SERIES.id ? id : null;
}

export type B2bPartner =
  | { status: "existing"; idokladId: number; name: string }
  | { status: "new"; name: string; ico: string; dic: string | null; street: string | null; city: string | null; zip: string | null }
  | { status: "missing" };

export type B2bExistingInvoice = { idokladId: number; number: string; totalKc: number | null; dateOfIssue: string | null };

export type B2bPreview = {
  value: B2bInvoiceInput;
  canIssueLive: boolean;
  liveReason: string | null;
  series: { id: string; name: string } | null;
  nextNumber: string | null;
  partner: B2bPartner;
  organization: { id: string; name: string } | null;
  paymentLabel: string;
  similar: B2bExistingInvoice[];
  blocking: string[];
  warnings: string[];
  fingerprint: string;
};

type Deps = { env?: Env; fetchImpl?: typeof fetch; now?: Date };

function readClient(env: Env, seriesId: string, fetchImpl?: typeof fetch): EshopIdokladClient | null {
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) return null;
  return new EshopIdokladClient({ ...credentials, writesAllowed: false, b2bSeriesId: seriesId, env, fetchImpl });
}

/** „Testovací 1, 110 00 Praha 1“ → ulice / PSČ / obec (stačí pro kontakt v iDokladu). */
function splitAddress(raw: string | null): { street: string | null; zip: string | null; city: string | null } {
  if (!raw) return { street: null, zip: null, city: null };
  const m = /^(.*?),\s*(\d{3})\s?(\d{2})\s+(.+)$/.exec(raw.trim());
  return m ? { street: m[1].trim(), zip: `${m[2]}${m[3]}`, city: m[4].trim() } : { street: raw.trim(), zip: null, city: null };
}

async function findPartner(db: Db, client: EshopIdokladClient, ico: string): Promise<{ partner: B2bPartner; organization: B2bPreview["organization"]; problem: string | null }> {
  const [org] = (await db.execute(sql`SELECT id, name, registered_address, dic FROM organizations WHERE ico = ${ico}`)).rows as {
    id: string;
    name: string;
    registered_address: string;
    dic: string | null;
  }[];
  const organization = org ? { id: org.id, name: org.name } : null;
  const found = (await client.list<{ Id: number; IdentificationNumber?: string | null; CompanyName?: string | null }>("/Contacts", eqFilter("IdentificationNumber", ico), 20)).Items.filter(
    (c) => (c.IdentificationNumber ?? "").replace(/\s/g, "") === ico
  );
  if (found.length > 1) {
    return { partner: { status: "missing" }, organization, problem: `V iDokladu je víc kontaktů s IČO ${ico} (${found.map((c) => c.Id).join(", ")}) — sjednoťte je v iDokladu.` };
  }
  if (found.length === 1) return { partner: { status: "existing", idokladId: found[0].Id, name: found[0].CompanyName?.trim() || org?.name || ico }, organization, problem: null };
  if (org) {
    const address = splitAddress(org.registered_address);
    return { partner: { status: "new", name: org.name, ico, dic: org.dic, ...address }, organization, problem: null };
  }
  return {
    partner: { status: "missing" },
    organization,
    problem: `Odběratel s IČO ${ico} není v iDokladu ani v MojeBegina. Založte ho (zákazník v MojeBegina nebo kontakt v iDokladu) a připravte fakturu znovu.`,
  };
}

async function findSimilar(client: EshopIdokladClient, partnerId: number, value: B2bInvoiceInput): Promise<B2bExistingInvoice[]> {
  const from = addDays(value.issueDate, -B2B_DUPLICATE_DAYS);
  const page = await client.list<{ Id: number; DocumentNumber?: string | null; DateOfIssue?: string | null; Prices?: { TotalWithVat?: number | null } | null }>(
    "/IssuedInvoices",
    issuedInvoiceFilter(eqFilter("PartnerId", String(partnerId))),
    100
  );
  return page.Items.filter((i) => (i.DateOfIssue ?? "").slice(0, 10) >= from && Math.abs((i.Prices?.TotalWithVat ?? -1) - value.totalKc) < 0.005).map((i) => ({
    idokladId: i.Id,
    number: (i.DocumentNumber ?? "").trim(),
    totalKc: i.Prices?.TotalWithVat ?? null,
    dateOfIssue: (i.DateOfIssue ?? "").slice(0, 10) || null,
  }));
}

function fingerprintOf(value: B2bInvoiceInput, partner: B2bPartner, seriesId: string | null): string {
  const partnerKey = partner.status === "existing" ? { id: partner.idokladId } : partner;
  return createHash("sha256").update(JSON.stringify({ value, partner: partnerKey, seriesId })).digest("hex");
}

/** Návrh B2B faktury — jen čtení (iDoklad GET + MojeBegina SELECT). */
export async function prepareB2bInvoice(db: Db, value: B2bInvoiceInput, deps: Deps = {}): Promise<{ ok: true; preview: B2bPreview; resolved: PreflightResolved | null } | { ok: false; error: string }> {
  const env = deps.env ?? process.env;
  const seriesId = b2bSeriesId(env);
  if (!seriesId) return { ok: false, error: "B2B fakturace z MojeBegina není zapnutá (chybí IDOKLAD_B2B_SEQUENCE_ID — ID Luciiny řady v iDokladu)." };
  const client = readClient(env, seriesId, deps.fetchImpl);
  if (!client) return { ok: false, error: "iDoklad není na tomto prostředí připojený (chybí přístupové údaje)." };
  const gate = liveInvoicingGate(env);
  const blocking: string[] = [];

  const preflight = await runIdokladPreflight(client, { seriesId, day: value.issueDate, now: deps.now, profile: "b2b" });
  if (!preflight.ok) blocking.push(preflightFailureSummary(preflight));
  const { partner, organization, problem } = await findPartner(db, client, value.ico).catch((error: unknown) => ({
    partner: { status: "missing" } as B2bPartner,
    organization: null,
    problem: error instanceof IdokladApiError ? error.message : "Odběratele se nepodařilo dohledat v iDokladu.",
  }));
  if (problem) blocking.push(problem);
  const similar = partner.status === "existing" ? await findSimilar(client, partner.idokladId, value) : [];
  const warnings = b2bWarnings(value);
  if (partner.status === "new") warnings.push(`Odběratel ${partner.name} (IČO ${partner.ico}) v iDokladu ještě není — při vystavení se založí jako kontakt z údajů MojeBegina.`);
  if (similar.length) {
    warnings.push(`Možná duplicita: odběratel má v iDokladu ve ±${B2B_DUPLICATE_DAYS} dnech fakturu se stejnou částkou (${similar.map((s) => s.number).join(", ")}). Vystavit lze jen s confirm_not_duplicate=true.`);
  }
  return {
    ok: true,
    resolved: preflight.resolved,
    preview: {
      value,
      canIssueLive: gate.open,
      liveReason: gate.open ? null : gate.reason,
      series: preflight.resolved ? { id: String(preflight.resolved.sequence.id), name: preflight.resolved.sequence.name } : null,
      nextNumber: preflight.resolved?.next.documentNumber ?? null,
      partner,
      organization,
      paymentLabel: B2B_PAYMENT_LABELS[value.paymentMethod],
      similar,
      blocking,
      warnings,
      fingerprint: fingerprintOf(value, partner, seriesId),
    },
  };
}

function invoiceBody(value: B2bInvoiceInput, partnerId: number, resolved: PreflightResolved): Record<string, unknown> {
  const fromDefaults: Record<string, unknown> = {};
  for (const key of ["AccountNumber", "BankId", "Iban", "Swift", "ConstantSymbolId", "IsIncomeTax", "ItemsTextPrefix"]) {
    if (resolved.defaults[key] !== undefined && resolved.defaults[key] !== null) fromDefaults[key] = resolved.defaults[key];
  }
  const pricing: ItemPricing = resolved.pricing;
  return {
    IsIncomeTax: true,
    ...fromDefaults,
    PartnerId: partnerId,
    NumericSequenceId: resolved.sequence.id,
    DocumentSerialNumber: resolved.next.serial,
    VariableSymbol: resolved.next.documentNumber,
    DateOfIssue: idokladDate(value.issueDate),
    DateOfTaxing: idokladDate(value.issueDate),
    DateOfMaturity: idokladDate(value.dueDate),
    CurrencyId: resolved.currencyId,
    PaymentOptionId: resolved.paymentOptionIds[value.paymentMethod],
    OrderNumber: value.orderNumber,
    Description: value.description,
    DiscountPercentage: 0,
    IsEet: false,
    ReportLanguage: IDOKLAD_ENUMS.Language.Cz,
    ItemsTextSuffix: value.note,
    Items: value.items.map((item) => ({
      Name: item.name,
      Amount: item.quantity,
      Unit: item.unit,
      UnitPrice: item.unitPriceKc,
      PriceType: pricing.priceType,
      VatRateType: pricing.vatRateType,
      DiscountPercentage: 0,
      IsTaxMovement: false,
      ItemType: IDOKLAD_ENUMS.IssuedInvoiceItemType.Normal,
    })),
  };
}

export type B2bIssueResult =
  | { ok: true; invoiceNumber: string; idokladId: number; totalKc: number; paid: boolean; dueDate: string; partnerName: string; contactCreated: boolean; warnings?: string[] }
  | { ok: false; error: string; existing?: B2bExistingInvoice[] };

type IdokladInvoice = { Id: number; DocumentNumber?: string | null; NumericSequenceId?: number | null; Prices?: { TotalWithVat?: number | null } | null; PaymentStatus?: number | string | null };

/** Text chyby iDokladu pro uživatele (už bez tajných údajů — EshopIdokladClient.redact); jiné chyby null. */
function idokladProblem(error: unknown): string | null {
  return error instanceof IdokladApiError || error instanceof IdokladBlockedError ? error.message : null;
}

/** Odpověď iDokladu (4xx/5xx se zprávou) = zápis neproběhl; výpadek / timeout = nejisté. */
function definitelyRejected(error: unknown): boolean {
  return error instanceof IdokladBlockedError || (error instanceof IdokladApiError && error.httpStatus !== null);
}

/**
 * Vystaví B2B fakturu přesně podle návrhu. Kontrola iDokladu znovu těsně
 * před zápisem; zápisy: (kontakt) → faktura → (FullyPay, jen paid=true).
 *
 * Chyby iDokladu se vrací uživateli s důvodem a se stavem (12. 11. 2026 —
 * dřív skončily obecnou hláškou serveru a nešlo poznat proč, ani zda faktura
 * vznikla). Po vzniku faktury se už nikdy nevrací ok=false bez čísla faktury:
 * asistent by jinak mohl vystavit znovu.
 */
export async function issueB2bInvoice(
  db: Db,
  value: B2bInvoiceInput,
  options: { expectedFingerprint: string; confirmNotDuplicate: boolean; actor: { userId: string; name: string }; via: Record<string, unknown> },
  deps: Deps = {}
): Promise<B2bIssueResult> {
  const env = deps.env ?? process.env;
  let prepared: Awaited<ReturnType<typeof prepareB2bInvoice>>;
  try {
    prepared = await prepareB2bInvoice(db, value, deps);
  } catch (error) {
    const problem = idokladProblem(error);
    if (problem === null) throw error;
    return { ok: false, error: `Kontrola iDokladu před vystavením se nezdařila: ${problem} Nic se nevystavilo.` };
  }
  if (!prepared.ok) return prepared;
  const { preview, resolved } = prepared;
  if (preview.fingerprint !== options.expectedFingerprint) {
    return { ok: false, error: "Údaje faktury nebo odběratele se od náhledu změnily. Nic se nevystavilo — připravte fakturu znovu (prepare_b2b_invoice)." };
  }
  if (preview.blocking.length) return { ok: false, error: `${preview.blocking.join(" ")} Nic se nevystavilo.` };
  if (preview.similar.length && !options.confirmNotDuplicate) {
    return { ok: false, error: "Odběratel má podobnou fakturu (stejná částka, ±7 dní). Vystavit lze jen s confirm_not_duplicate=true po výslovném potvrzení uživatele.", existing: preview.similar };
  }
  const gate = liveInvoicingGate(env);
  if (!gate.open) return { ok: false, error: gate.reason };
  if (!resolved) return { ok: false, error: "Kontrola iDokladu neprošla — nic se nevystavilo." };
  const seriesId = b2bSeriesId(env)!;
  const client = new EshopIdokladClient({ clientId: gate.clientId, clientSecret: gate.clientSecret, applicationId: gate.applicationId, writesAllowed: true, b2bSeriesId: seriesId, env, fetchImpl: deps.fetchImpl });

  let partnerId: number;
  let contactCreated = false;
  const partner = preview.partner;
  if (partner.status === "existing") partnerId = partner.idokladId;
  else if (partner.status === "new") {
    let contact: { Id: number } | null;
    try {
      contact = await client.post<{ Id: number }>("/Contacts", {
        CompanyName: partner.name.slice(0, 200),
        IdentificationNumber: partner.ico,
        VatIdentificationNumber: partner.dic,
        Street: partner.street,
        City: partner.city,
        PostalCode: partner.zip,
        CountryId: resolved.countryId,
      });
    } catch (error) {
      const problem = idokladProblem(error);
      if (problem === null) throw error;
      return definitelyRejected(error)
        ? { ok: false, error: `iDoklad odmítl založit kontakt odběratele ${partner.name}: ${problem} Faktura se nevystavila.` }
        : { ok: false, error: `Zakládání kontaktu ${partner.name} v iDokladu nedoběhlo (${problem}). Faktura se nevystavila; než to zkusíte znovu, ověřte v iDokladu, zda kontakt nevznikl (pak by byl dvakrát).` };
    }
    if (!contact?.Id) return { ok: false, error: "iDoklad nevrátil ID nového kontaktu — nic se nevystavilo." };
    partnerId = contact.Id;
    contactCreated = true;
  } else return { ok: false, error: "Odběratel není určený." };
  const contactNote = contactCreated ? ` Kontakt odběratele (ID ${partnerId}) se v iDokladu už založil — příště se najde.` : "";

  let invoice: IdokladInvoice | null;
  try {
    invoice = await client.post<IdokladInvoice>("/IssuedInvoices", invoiceBody(value, partnerId, resolved));
  } catch (error) {
    const problem = idokladProblem(error);
    if (problem === null) throw error;
    return definitelyRejected(error)
      ? { ok: false, error: `iDoklad fakturu odmítl: ${problem} Faktura se nevystavila.${contactNote}` }
      : { ok: false, error: `Vystavení v iDokladu nedoběhlo (${problem}). NENÍ JISTÉ, zda faktura vznikla — nejdřív ji dohledejte v iDokladu (idoklad_search_invoices), teprve pak zkoušejte znovu.${contactNote}` };
  }
  if (!invoice?.Id) {
    return { ok: false, error: `iDoklad nevrátil ID nové faktury — NENÍ JISTÉ, zda vznikla. Nejdřív ji dohledejte v iDokladu (idoklad_search_invoices), teprve pak zkoušejte znovu.${contactNote}` };
  }
  const number = (invoice.DocumentNumber ?? "").trim();
  const created = { ok: true as const, invoiceNumber: number, idokladId: invoice.Id, totalKc: value.totalKc, paid: value.paid, dueDate: value.dueDate, partnerName: partner.name, contactCreated };
  const warnings: string[] = [];
  if (!B2B_NUMBER_RE.test(number) || String(invoice.NumericSequenceId ?? seriesId) !== seriesId) {
    warnings.push(`Faktura vznikla s číslem „${number}“ mimo očekávanou řadu — nutná ruční kontrola v iDokladu.`);
  }
  try {
    if (value.paid) await client.put<boolean>(`/IssuedDocumentPayments/FullyPay/${invoice.Id}`, { dateOfPayment: `${value.issueDate} 12:00:00.000` });
    const check = await client.get<IdokladInvoice>(`/IssuedInvoices/${invoice.Id}`);
    const total = check?.Prices?.TotalWithVat ?? null;
    if (total === null || Math.abs(total - value.totalKc) >= 0.005) {
      warnings.push(`Faktura má v iDokladu celkem ${total ?? "—"} Kč, čekáno ${value.totalKc} Kč — nutná ruční kontrola.`);
    }
  } catch (error) {
    const problem = idokladProblem(error);
    if (problem === null) throw error;
    warnings.push(
      value.paid
        ? `Faktura vznikla, ale označení „uhrazeno“ / kontrola v iDokladu se nezdařila (${problem}) — zkontrolujte a případně označte úhradu v iDokladu ručně. Fakturu NEVYSTAVUJTE znovu.`
        : `Faktura vznikla, ale závěrečná kontrola v iDokladu se nezdařila (${problem}) — zkontrolujte ji v iDokladu. Fakturu NEVYSTAVUJTE znovu.`
    );
  }

  if (preview.organization) {
    try {
      await db.execute(sql`
        INSERT INTO organization_activity (organization_id, author_user_id, author_name, kind, metadata)
        VALUES (${preview.organization.id}, ${options.actor.userId}, ${options.actor.name}, 'invoice_issued',
                ${JSON.stringify({ ...options.via, invoiceNumber: number, idokladId: invoice.Id, totalKc: value.totalKc, paid: value.paid, paymentMethod: value.paymentMethod, dueDate: value.dueDate, series: seriesId })}::jsonb)`);
    } catch (error) {
      console.error("B2B faktura: zápis do historie zákazníka se nezdařil", invoice.Id, error instanceof Error ? error.name : typeof error);
      warnings.push("Faktura vznikla, jen se nezapsala do historie zákazníka v MojeBegina.");
    }
  }
  return warnings.length ? { ...created, warnings } : created;
}
