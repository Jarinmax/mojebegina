// Oprava EXISTUJÍCÍ faktury v iDokladu z MojeBegina (rozhodnutí majitele
// 15. 11. 2026): změna způsobu úhrady (převodem / hotově / kartou) a evidence
// úhrady celé zbývající částky k danému dni. Nic nevystavuje — žádná nová
// faktura, žádný dobropis, žádné jiné pole faktury se nemění.
//
// Jen faktury z Luciiny řady (IDOKLAD_B2B_SEQUENCE_ID, čísla RRRRNNNN):
// e-shopové faktury (7277293) vede MojeBegina ve vlastní tabulce invoices
// a jejich úhradu řídí objednávka — tady se neopravují.
//
// Zápisy (EshopIdokladClient s corrections: true, brána ostrého provozu):
//   1. PATCH /IssuedInvoices { Id, PaymentOptionId } — nic jiného klient
//      nepustí (assertCorrectionBody),
//   2. PUT /IssuedDocumentPayments/FullyPay/{id}?dateOfPayment=… — úhrada
//      zbývající částky; částečné úhrady se nepodporují (částka musí sedět
//      na haléř se zbývající částkou),
// pak kontrola v iDokladu (způsob úhrady, uhrazeno, zbývá 0) a kontrola
// textu nového PDF (žádná výzva k úhradě, žádné upozornění na prodlení).
//
// Postup: prepareInvoiceCorrection (jen čtení) → uživatel potvrdí →
// applyInvoiceCorrection se stejným otiskem (fingerprint) — když se faktura
// mezitím změnila (jiná úhrada, jiný způsob), nic se nezapíše.
import { createHash } from "node:crypto";
import { PAYMENT_OPTION_MATCH } from "./idoklad";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError, eqFilter, issuedInvoiceFilter } from "./idokladHttp";
import { eshopIdokladCredentials, liveInvoicingGate } from "./mode";
import { B2B_NUMBER_RE } from "./preflight";
import { b2bSeriesId } from "./b2bInvoice";
import { addDays } from "./b2bInvoiceValidation";
import { checkInvoicePdfText, extractPdfText, type PdfPaymentCheck } from "./pdfText";

type Env = Record<string, string | undefined>;
type Deps = { env?: Env; fetchImpl?: typeof fetch; today?: string };

export const CORRECTION_PAYMENT_METHODS = ["bank_transfer", "cash", "card"] as const;
export type CorrectionPaymentMethod = (typeof CORRECTION_PAYMENT_METHODS)[number];
const METHOD_LABELS: Record<CorrectionPaymentMethod, string> = { bank_transfer: "převodem", cash: "hotově", card: "kartou" };

/** Nejvýš tolik dní zpět smí být datum evidované úhrady. */
export const CORRECTION_PAYMENT_MAX_DAYS_BACK = 60;
const SERIES_PAGES = 20;

export type InvoiceCorrectionInput = {
  invoiceId: number | null;
  number: string | null;
  paymentMethod: CorrectionPaymentMethod | null;
  payment: { amountKc: number; date: string } | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string) => DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const pragueToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

/** Kontrola vstupu bez sítě. */
export function validateCorrection(raw: InvoiceCorrectionInput, today: string): { ok: true; value: InvoiceCorrectionInput } | { ok: false; error: string } {
  if (raw.invoiceId === null && !raw.number) return { ok: false, error: "Zadejte číslo faktury (number) nebo její ID v iDokladu." };
  if (raw.number !== null && !B2B_NUMBER_RE.test(raw.number)) {
    return { ok: false, error: `Opravit lze jen faktury z Luciiny řady (čísla RRRRNNNN, např. 20260212) — „${raw.number}“ k nim nepatří.` };
  }
  if (!raw.paymentMethod && !raw.payment) return { ok: false, error: "Není co opravit — zadejte nový způsob úhrady (payment_method) a/nebo úhradu (payment_amount_kc + payment_date)." };
  if (raw.paymentMethod && !CORRECTION_PAYMENT_METHODS.includes(raw.paymentMethod)) return { ok: false, error: "Způsob úhrady musí být bank_transfer, cash nebo card." };
  if (raw.payment) {
    const { amountKc, date } = raw.payment;
    if (!(Number.isFinite(amountKc) && amountKc > 0 && Math.abs(amountKc * 100 - Math.round(amountKc * 100)) < 1e-6)) {
      return { ok: false, error: "Částka úhrady musí být kladná, nejvýš na haléře." };
    }
    if (!validDay(date)) return { ok: false, error: "Datum úhrady musí být ve tvaru RRRR-MM-DD." };
    if (date > today) return { ok: false, error: `Datum úhrady ${date} je v budoucnosti.` };
    if (date < addDays(today, -CORRECTION_PAYMENT_MAX_DAYS_BACK)) return { ok: false, error: `Datum úhrady může být nejvýš ${CORRECTION_PAYMENT_MAX_DAYS_BACK} dní zpět.` };
  }
  return { ok: true, value: raw };
}

type RawInvoice = {
  Id: number;
  DocumentNumber?: string | null;
  PaymentOptionId?: number | null;
  PaymentStatus?: number | string | null;
  DateOfIssue?: string | null;
  DateOfMaturity?: string | null;
  DateOfPayment?: string | null;
  PartnerAddress?: { NickName?: string | null; Firstname?: string | null; Surname?: string | null; IdentificationNumber?: string | null } | null;
  Prices?: { TotalWithVat?: number | null; TotalPaid?: number | null } | null;
};

const PAYMENT_STATES: Record<string, string> = { "0": "unpaid", Unpaid: "unpaid", "1": "paid", Paid: "paid", "2": "partially_paid", PartialPaid: "partially_paid", "3": "overpaid", Overpaid: "overpaid" };
const day = (raw: string | null | undefined) => {
  const d = (raw ?? "").slice(0, 10);
  return d && !d.startsWith("1753") ? d : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceState = {
  idokladId: number;
  number: string;
  customer: string | null;
  customerIco: string | null;
  totalKc: number;
  paidKc: number;
  remainingKc: number;
  paymentStatus: string;
  paymentMethod: { id: number | null; name: string | null; key: CorrectionPaymentMethod | null };
  dateOfIssue: string | null;
  dateOfMaturity: string | null;
  dateOfPayment: string | null;
};

function stateOf(raw: RawInvoice, options: { Id: number; Name?: string | null }[], ids: Partial<Record<CorrectionPaymentMethod, number>>): InvoiceState {
  const total = round2(raw.Prices?.TotalWithVat ?? 0);
  const paid = round2(raw.Prices?.TotalPaid ?? 0);
  const optionId = typeof raw.PaymentOptionId === "number" ? raw.PaymentOptionId : null;
  const key = (Object.entries(ids).find(([, id]) => id === optionId)?.[0] ?? null) as CorrectionPaymentMethod | null;
  const p = raw.PartnerAddress;
  const customer = p?.NickName?.trim() || [p?.Firstname, p?.Surname].filter(Boolean).join(" ").trim() || null;
  return {
    idokladId: raw.Id,
    number: (raw.DocumentNumber ?? "").trim(),
    customer,
    customerIco: p?.IdentificationNumber?.replace(/\s/g, "") || null,
    totalKc: total,
    paidKc: paid,
    remainingKc: round2(total - paid),
    paymentStatus: PAYMENT_STATES[String(raw.PaymentStatus)] ?? "unknown",
    paymentMethod: { id: optionId, name: options.find((o) => o.Id === optionId)?.Name?.trim() ?? null, key },
    dateOfIssue: day(raw.DateOfIssue),
    dateOfMaturity: day(raw.DateOfMaturity),
    dateOfPayment: day(raw.DateOfPayment),
  };
}

export type CorrectionPreview = {
  invoice: InvoiceState;
  changes: { paymentMethod: { from: string | null; to: string; toKey: CorrectionPaymentMethod } | null; payment: { amountKc: number; date: string } | null };
  canApplyLive: boolean;
  liveReason: string | null;
  blocking: string[];
  warnings: string[];
  fingerprint: string;
};

type Prepared = { ok: true; preview: CorrectionPreview; targetOptionId: number | null } | { ok: false; error: string };

function readClient(env: Env, fetchImpl?: typeof fetch): EshopIdokladClient | null {
  const credentials = eshopIdokladCredentials(env);
  return credentials ? new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl, requestBudget: 40 }) : null;
}

async function findInvoice(client: EshopIdokladClient, input: InvoiceCorrectionInput): Promise<RawInvoice | string> {
  if (input.invoiceId !== null) {
    const raw = await client.get<RawInvoice | null>(`/IssuedInvoices/${input.invoiceId}`).catch((error: unknown) => {
      if (error instanceof IdokladApiError && error.httpStatus === 404) return null;
      throw error;
    });
    if (!raw?.Id) return `Faktura s ID ${input.invoiceId} v iDokladu není.`;
    if (input.number && (raw.DocumentNumber ?? "").trim() !== input.number) return `Faktura ID ${input.invoiceId} má číslo ${raw.DocumentNumber ?? "—"}, ne ${input.number}.`;
    return raw;
  }
  const found = await client.list<{ Id: number; DocumentNumber?: string | null }>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("DocumentNumber", input.number!)), 5);
  const same = found.Items.filter((i) => (i.DocumentNumber ?? "").trim() === input.number);
  if (same.length === 0) return `Faktura ${input.number} v iDokladu není.`;
  if (same.length > 1) return `Číslo ${input.number} má v iDokladu víc faktur (ID ${same.map((i) => i.Id).join(", ")}) — upřesněte ID.`;
  return client.get<RawInvoice>(`/IssuedInvoices/${same[0].Id}`);
}

/** Je faktura v dané řadě? Filtr NumericSequenceId~eq~ (ověřený v Production, viz idoklad-read). */
async function inSeries(client: EshopIdokladClient, invoiceId: number, seriesId: string): Promise<boolean> {
  const filter = issuedInvoiceFilter(eqFilter("NumericSequenceId", seriesId));
  for (let page = 1; page <= SERIES_PAGES; page += 1) {
    const result = await client.list<{ Id: number }>("/IssuedInvoices", filter, 100, page);
    if (result.Items.some((i) => i.Id === invoiceId)) return true;
    if (page >= result.TotalPages || result.Items.length === 0) break;
  }
  return false;
}

function fingerprintOf(state: InvoiceState, input: InvoiceCorrectionInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: state.idokladId,
        number: state.number,
        total: state.totalKc,
        paid: state.paidKc,
        option: state.paymentMethod.id,
        method: input.paymentMethod,
        payment: input.payment,
      })
    )
    .digest("hex");
}

/** Návrh opravy — jen čtení iDokladu. */
export async function prepareInvoiceCorrection(input: InvoiceCorrectionInput, deps: Deps = {}): Promise<Prepared> {
  const env = deps.env ?? process.env;
  const seriesId = b2bSeriesId(env);
  if (!seriesId) return { ok: false, error: "Opravy faktur z MojeBegina nejsou zapnuté (chybí IDOKLAD_B2B_SEQUENCE_ID — ID Luciiny řady v iDokladu)." };
  const client = readClient(env, deps.fetchImpl);
  if (!client) return { ok: false, error: "iDoklad není na tomto prostředí připojený (chybí přístupové údaje)." };
  const gate = liveInvoicingGate(env);

  const found = await findInvoice(client, input);
  if (typeof found === "string") return { ok: false, error: found };
  const options = (await client.list<{ Id: number; Name?: string | null }>("/PaymentOptions")).Items;
  const ids: Partial<Record<CorrectionPaymentMethod, number>> = {};
  const blocking: string[] = [];
  for (const method of CORRECTION_PAYMENT_METHODS) {
    const rule = PAYMENT_OPTION_MATCH[method];
    const matches = options.filter((o) => rule.name.test(o.Name ?? "") && !rule.exclude.test(o.Name ?? ""));
    if (matches.length === 1) ids[method] = matches[0].Id;
    else if (input.paymentMethod === method) blocking.push(`Způsob úhrady „${METHOD_LABELS[method]}“ není v iDokladu jednoznačný (nalezeno ${matches.length}).`);
  }
  const state = stateOf(found, options, ids);
  const warnings: string[] = [];

  if (!B2B_NUMBER_RE.test(state.number) || !(await inSeries(client, state.idokladId, seriesId))) {
    blocking.push(`Faktura ${state.number || state.idokladId} není v Luciině řadě (${seriesId}) — opravovat lze jen faktury z této řady.`);
  }

  let methodChange: CorrectionPreview["changes"]["paymentMethod"] = null;
  if (input.paymentMethod) {
    if (state.paymentMethod.id !== null && state.paymentMethod.id === ids[input.paymentMethod]) {
      warnings.push(`Faktura už má způsob úhrady „${state.paymentMethod.name ?? METHOD_LABELS[input.paymentMethod]}“ — ten se nemění.`);
    } else {
      methodChange = { from: state.paymentMethod.name, to: METHOD_LABELS[input.paymentMethod], toKey: input.paymentMethod };
      if (state.paidKc > 0) warnings.push(`Faktura už má evidovanou úhradu ${state.paidKc} Kč — mění se jen způsob úhrady na faktuře, už evidované platby zůstávají.`);
    }
  }

  if (input.payment) {
    const { amountKc, date } = input.payment;
    if (state.remainingKc <= 0) blocking.push(`Faktura ${state.number} už je uhrazená (zbývá ${state.remainingKc} Kč) — další úhradu nelze zaevidovat.`);
    else if (Math.abs(amountKc - state.remainingKc) >= 0.005) {
      blocking.push(`Částka ${amountKc} Kč nesedí se zbývající částkou ${state.remainingKc} Kč (celkem ${state.totalKc}, uhrazeno ${state.paidKc}). Částečné úhrady se zatím z MojeBegina neevidují — nic se nezapíše.`);
    }
    if (state.dateOfIssue && date < state.dateOfIssue) {
      warnings.push(`Datum úhrady ${date} je dřív než datum vystavení ${state.dateOfIssue} (zaplaceno předem / při předání). iDoklad to může odmítnout — pak se nic nezapíše a uvidíte důvod.`);
    }
  }
  if (!methodChange && !input.payment) blocking.push("Není co opravit — faktura už je v požadovaném stavu.");

  return {
    ok: true,
    targetOptionId: methodChange ? (ids[methodChange.toKey] ?? null) : null,
    preview: {
      invoice: state,
      changes: { paymentMethod: methodChange, payment: input.payment },
      canApplyLive: gate.open,
      liveReason: gate.open ? null : gate.reason,
      blocking,
      warnings,
      fingerprint: fingerprintOf(state, input),
    },
  };
}

export type CorrectionResult =
  | {
      ok: true;
      invoice: InvoiceState;
      applied: { paymentMethodChanged: boolean; paymentRecorded: boolean };
      verified: { paymentMethodOk: boolean; paidOk: boolean; remainingKc: number };
      pdfCheck: (PdfPaymentCheck & { checked: true }) | { checked: false; reason: string };
      warnings: string[];
    }
  | { ok: false; error: string };

function idokladProblem(error: unknown): string | null {
  return error instanceof IdokladApiError || error instanceof IdokladBlockedError ? error.message : null;
}
function definitelyRejected(error: unknown): boolean {
  return error instanceof IdokladBlockedError || (error instanceof IdokladApiError && error.httpStatus !== null);
}

/** Provede opravu přesně podle návrhu (stejný otisk) a ověří výsledek v iDokladu i v PDF. */
export async function applyInvoiceCorrection(input: InvoiceCorrectionInput, options: { expectedFingerprint: string }, deps: Deps = {}): Promise<CorrectionResult> {
  const env = deps.env ?? process.env;
  let prepared: Prepared;
  try {
    prepared = await prepareInvoiceCorrection(input, deps);
  } catch (error) {
    const problem = idokladProblem(error);
    if (problem === null) throw error;
    return { ok: false, error: `Kontrola faktury v iDokladu se nezdařila: ${problem} Nic se nezměnilo.` };
  }
  if (!prepared.ok) return prepared;
  const { preview, targetOptionId } = prepared;
  if (preview.fingerprint !== options.expectedFingerprint) {
    return { ok: false, error: "Faktura se od náhledu v iDokladu změnila (úhrada nebo způsob úhrady). Nic se nezměnilo — připravte opravu znovu (prepare_invoice_correction)." };
  }
  if (preview.blocking.length) return { ok: false, error: `${preview.blocking.join(" ")} Nic se nezměnilo.` };
  const gate = liveInvoicingGate(env);
  if (!gate.open) return { ok: false, error: gate.reason };

  const client = new EshopIdokladClient({ clientId: gate.clientId, clientSecret: gate.clientSecret, applicationId: gate.applicationId, writesAllowed: true, corrections: true, env, fetchImpl: deps.fetchImpl, requestBudget: 40 });
  const id = preview.invoice.idokladId;
  const number = preview.invoice.number;
  const warnings = [...preview.warnings];
  let paymentMethodChanged = false;
  let paymentRecorded = false;

  if (preview.changes.paymentMethod && targetOptionId) {
    try {
      await client.patch(`/IssuedInvoices`, { Id: id, PaymentOptionId: targetOptionId });
      paymentMethodChanged = true;
    } catch (error) {
      const problem = idokladProblem(error);
      if (problem === null) throw error;
      return definitelyRejected(error)
        ? { ok: false, error: `iDoklad změnu způsobu úhrady faktury ${number} odmítl: ${problem} Nic se nezměnilo.` }
        : { ok: false, error: `Změna způsobu úhrady faktury ${number} nedoběhla (${problem}). Není jisté, zda se provedla — zkontrolujte fakturu (idoklad_get_invoice / prepare_invoice_correction), teprve pak zkoušejte znovu.` };
    }
  }

  if (preview.changes.payment) {
    try {
      await client.put<boolean>(`/IssuedDocumentPayments/FullyPay/${id}`, { dateOfPayment: `${preview.changes.payment.date} 12:00:00.000` });
      paymentRecorded = true;
    } catch (error) {
      const problem = idokladProblem(error);
      if (problem === null) throw error;
      const done = paymentMethodChanged ? ` Způsob úhrady už je změněný na „${preview.changes.paymentMethod?.to}“.` : "";
      return definitelyRejected(error)
        ? { ok: false, error: `iDoklad úhradu faktury ${number} nezaevidoval: ${problem}${done} Úhrada se nezapsala.` }
        : { ok: false, error: `Evidence úhrady faktury ${number} nedoběhla (${problem}).${done} Není jisté, zda se úhrada zapsala — nejdřív zkontrolujte fakturu, NEZKOUŠEJTE hned znovu (hrozí dvojí úhrada).` };
    }
  }

  // kontrola v iDokladu
  let after: InvoiceState = preview.invoice;
  let verified = { paymentMethodOk: !preview.changes.paymentMethod, paidOk: !preview.changes.payment, remainingKc: preview.invoice.remainingKc };
  try {
    const raw = await client.get<RawInvoice>(`/IssuedInvoices/${id}`);
    const options = (await client.list<{ Id: number; Name?: string | null }>("/PaymentOptions")).Items;
    const ids: Partial<Record<CorrectionPaymentMethod, number>> = {};
    if (preview.changes.paymentMethod && targetOptionId) ids[preview.changes.paymentMethod.toKey] = targetOptionId;
    after = stateOf(raw, options, ids);
    verified = {
      paymentMethodOk: !preview.changes.paymentMethod || after.paymentMethod.id === targetOptionId,
      paidOk: !preview.changes.payment || (after.paymentStatus === "paid" && Math.abs(after.remainingKc) < 0.005),
      remainingKc: after.remainingKc,
    };
    if (!verified.paymentMethodOk) warnings.push(`Po změně má faktura v iDokladu způsob úhrady „${after.paymentMethod.name ?? "—"}“ — zkontrolujte ji v iDokladu.`);
    if (!verified.paidOk) warnings.push(`Po evidenci úhrady je stav „${after.paymentStatus}“ a zbývá ${after.remainingKc} Kč — zkontrolujte fakturu v iDokladu.`);
  } catch (error) {
    const problem = idokladProblem(error);
    if (problem === null) throw error;
    warnings.push(`Změny se zapsaly, ale závěrečná kontrola v iDokladu se nezdařila (${problem}) — zkontrolujte fakturu. Opravu NEOPAKUJTE.`);
  }

  // kontrola textu nového PDF
  let pdfCheck: Extract<CorrectionResult, { ok: true }>["pdfCheck"];
  try {
    const base64 = await client.get<string>(`/Reports/IssuedInvoice/${id}/Pdf`);
    const bytes = Buffer.from(typeof base64 === "string" ? base64 : "", "base64");
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new IdokladApiError("Odpověď iDokladu není PDF.");
    const text = await extractPdfText(bytes);
    // pojistka: když se text nepřečetl (jiné kódování písma), kontrola by nic nenašla a lhala by „v pořádku“
    if (!text.replace(/\s/g, "").includes(number)) throw new Error("text PDF se nepodařilo přečíst");
    pdfCheck = { checked: true, ...checkInvoicePdfText(text) };
    if (!pdfCheck.ok) warnings.push("Nové PDF pořád obsahuje výzvu k úhradě nebo upozornění na prodlení (viz pdfCheck) — zkontrolujte ho.");
  } catch (error) {
    pdfCheck = { checked: false, reason: idokladProblem(error) ?? (error instanceof Error && error.message === "text PDF se nepodařilo přečíst" ? "Text PDF se nepodařilo přečíst (číslo faktury v něm není)." : "PDF se nepodařilo přečíst.") };
    warnings.push("PDF se nepodařilo automaticky zkontrolovat — otevřete ho a zkontrolujte ručně.");
  }

  return { ok: true, invoice: after, applied: { paymentMethodChanged, paymentRecorded }, verified, pdfCheck, warnings };
}

export { pragueToday as correctionToday };
