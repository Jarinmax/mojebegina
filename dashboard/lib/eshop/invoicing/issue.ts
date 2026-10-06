// ESHOP 1.0 — OSTRÉ vystavení e-shopové faktury v iDokladu.
//
// Spouští se jen při otevřené bráně ostrého provozu (mode.ts:
// liveInvoicingGate — Vercel Production + IDOKLAD_INVOICING_ENABLED=on +
// řada 7277293 + přístupové údaje). Jinak se nic nevolá a vrátí se
// „skipped“. Na Preview proto nikdy nevznikne ani jeden požadavek.
//
// Pojistky (schválené vedením 7. 10. 2026):
//   1. jen skutečně zaplacená e-shopová objednávka (orders.payment_status
//      = paid A ZÁROVEŇ přepočet plateb order_payment_balance = paid/overpaid),
//   2. jen řada 7277293 „E-shop Begina“ — před zápisem se ověří, že
//      existuje, je pro vydané faktury, NENÍ výchozí a sedí název,
//   3. jen agenda Begina (IČO 74337297) a jen neplátce DPH,
//   4. VS faktury = payment_vs objednávky (7xxxxxxx),
//   5. před vytvořením hledání faktury s tímto VS v iDokladu — když
//      existuje, jen se připojí (nic nového nevznikne); víc faktur = stop,
//   6. idempotence: vystavuje vždy jen jeden proces (zámek na vazbě
//      invoice_provider_links.next_attempt_at, 10 min); ID faktury
//      z iDokladu se uloží HNED po vytvoření, takže opakovaný webhook,
//      dvojklik ani pád uprostřed nevytvoří druhou fakturu,
//   7. kontakt: firma podle IČO, jinak podle e-mailu; nový se založí,
//   8. po vystavení „uhrazeno“ (FullyPay) a kontrola stavu i částky,
//   9. uloží se ID, číslo, stav, vazba na PDF; PDF posílá MojeBegina,
//      iDoklad žádný e-mail neposílá (/Mails je v pojistce zakázané),
//  10. stav „vystaveno“ (doc_state=issued, state=issued) se zapíše AŽ po
//      ověření všeho výše, jedním příkazem. Při jakékoli chybě zůstane
//      faktura „draft“ a vazba „failed“ s popisem chyby (a s ID faktury
//      z iDokladu, pokud už vznikla — další pokus naváže, nic nezdvojí).
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { blockingProblems, type InvoiceDraft } from "./draft";
import {
  IDOKLAD_ENUMS,
  IDOKLAD_PROVIDER,
  PAYMENT_OPTION_MATCH,
  contactPostBody,
  invoicePostBody,
  type ItemPricing,
} from "./idoklad";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError, eqFilter } from "./idokladHttp";
import { BEGINA_ICO, ESHOP_SERIES, liveInvoicingGate } from "./mode";
import { ISSUED_INVOICE_DOCUMENT_TYPE, checkEshopSeries, type IdokladNumericSequence } from "./numberSeries";
import { activitySql, buildDraftPayload, loadDraftInputs, prepareInvoiceDraft, type InvoiceActor } from "./service";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const ISSUE_LEASE_MINUTES = 10;
/** Číslo faktury v řadě 9{RR}{NNNN}: 9 + rok (2 číslice) + pořadí (4 číslice). */
const ESHOP_NUMBER_RE = /^9\d{2}\d{4}$/;

export type InvoicePdf = { filename: string; contentBase64: string; invoiceNumber: string };

export type IssueResult =
  | { status: "issued"; invoiceNumber: string; externalId: string; adopted: boolean; pdf: InvoicePdf | null }
  | { status: "already_issued"; invoiceNumber: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; externalId: string | null };

export type IssueDeps = { env?: Env; fetchImpl?: typeof fetch; actor?: InvoiceActor };

/** Chyba, kterou musí vyřešit člověk (ne výpadek sítě) — zpráva jde do MojeBegina. */
class IssueStop extends Error {}

type IdokladInvoice = {
  Id: number;
  DocumentNumber?: string | null;
  VariableSymbol?: string | null;
  PaymentStatus?: number | string | null;
  Prices?: { TotalWithVat?: number | null; TotalVat?: number | null; TotalPaid?: number | null } | null;
};

function enumIs(value: unknown, numeric: number, name: string): boolean {
  return value === numeric || value === name || value === String(numeric);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function documentTypeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === "IssuedInvoice") return ISSUED_INVOICE_DOCUMENT_TYPE;
  return -1;
}

function sameAmount(a: unknown, kc: number): boolean {
  return typeof a === "number" && Math.abs(a - kc) < 0.005;
}

// ------------------------------------------------------------- kontroly iDokladu

async function assertAgenda(client: EshopIdokladClient) {
  const agenda = await client.get<{
    IsRegisteredForVat?: boolean | null;
    PreferredPriceType?: number | string | null;
    Contact?: { IdentificationNumber?: string | null } | null;
  }>("/Account/CurrentAgenda");
  const ico = agenda?.Contact?.IdentificationNumber?.replace(/\s/g, "") ?? null;
  if (ico !== BEGINA_ICO) throw new IssueStop(`Přihlášená agenda iDokladu není Begina (IČO ${ico ?? "neuvedeno"}) — nic se nevystavilo.`);
  if (agenda.IsRegisteredForVat !== false) {
    throw new IssueStop("Agenda v iDokladu je vedená jako plátce DPH — e-shop počítá s neplátcem, nic se nevystavilo.");
  }
  return agenda;
}

async function assertSeries(client: EshopIdokladClient, seriesId: string): Promise<IdokladNumericSequence> {
  const page = await client.list<IdokladNumericSequence>(
    "/NumericSequences",
    `DocumentType~eq~${ISSUED_INVOICE_DOCUMENT_TYPE}`
  );
  const sequences = page.Items.map((s) => ({ ...s, DocumentType: documentTypeNumber(s.DocumentType) }));
  const check = checkEshopSeries(seriesId, sequences);
  if (!check.ok) throw new IssueStop(check.problems.map((p) => p.message).join(" "));
  if ((check.sequence.Name ?? "").trim().toLowerCase() !== ESHOP_SERIES.name.toLowerCase()) {
    throw new IssueStop(`Řada ${seriesId} se v iDokladu jmenuje „${check.sequence.Name ?? ""}“, ne „${ESHOP_SERIES.name}“ — nic se nevystavilo.`);
  }
  return check.sequence;
}

/** Faktura s VS v iDokladu (pojistka proti dvojí faktuře). */
async function findByVs(client: EshopIdokladClient, vs: string): Promise<IdokladInvoice | null> {
  const page = await client.list<IdokladInvoice>("/IssuedInvoices", eqFilter("VariableSymbol", vs), 5);
  const matches = page.Items.filter((i) => i.VariableSymbol === vs);
  if (matches.length > 1 || page.TotalItems > 1) {
    throw new IssueStop(`V iDokladu je víc vydaných faktur s VS ${vs} — nutná ruční kontrola, nic se nevystavilo.`);
  }
  return matches[0] ?? null;
}

function assertOurInvoice(invoice: IdokladInvoice, vs: string) {
  if (invoice.VariableSymbol !== vs) {
    throw new IssueStop(`Faktura ${invoice.Id} v iDokladu má jiný VS (${invoice.VariableSymbol ?? "—"}) — nutná ruční kontrola.`);
  }
  if (!invoice.DocumentNumber || !ESHOP_NUMBER_RE.test(invoice.DocumentNumber)) {
    throw new IssueStop(
      `Faktura s VS ${vs} v iDokladu existuje, ale její číslo ${invoice.DocumentNumber ?? "—"} není z řady E-shop Begina — nutná ruční kontrola.`
    );
  }
}

async function resolveContact(db: Db, client: EshopIdokladClient, draft: InvoiceDraft, customerId: string | null): Promise<number> {
  // 1. známá vazba zákazník → kontakt iDokladu
  if (customerId) {
    const ref = (
      await db.execute(sql`SELECT external_id FROM invoice_customer_refs WHERE customer_id = ${customerId} AND provider = ${IDOKLAD_PROVIDER}`)
    ).rows[0] as { external_id: string } | undefined;
    if (ref && /^[1-9][0-9]{0,9}$/.test(ref.external_id)) {
      try {
        const contact = await client.get<{ Id: number }>(`/Contacts/${ref.external_id}`);
        if (contact?.Id) return contact.Id;
      } catch (error) {
        if (!(error instanceof IdokladApiError && error.httpStatus === 404)) throw error;
        // kontakt v iDokladu smazali — najde/založí se znovu
      }
    }
  }
  // 2. hledání (firma podle IČO — dnes pokladna firmy nesbírá; jinak e-mail)
  const email = draft.customer.email;
  if (!email) throw new IssueStop("Zákazník nemá e-mail — kontakt v iDokladu nejde dohledat.");
  const found = await client.list<{ Id: number; Email?: string | null }>("/Contacts", eqFilter("Email", email), 20);
  const same = found.Items.filter((c) => (c.Email ?? "").trim().toLowerCase() === email).sort((a, b) => a.Id - b.Id);
  let partnerId = same[0]?.Id ?? null;
  // 3. založení
  if (!partnerId) {
    const countries = await client.list<{ Id: number; Code?: string | null }>("/Countries", eqFilter("Code", "CZE"), 5);
    const cz = countries.Items.filter((c) => c.Code === "CZE");
    if (cz.length !== 1) throw new IssueStop("V číselníku zemí iDokladu se nepodařilo jednoznačně najít Českou republiku (CZE).");
    const created = await client.post<{ Id: number }>("/Contacts", contactPostBody(draft, { countryId: cz[0].Id }));
    if (!created?.Id) throw new IdokladApiError("iDoklad nevrátil ID nového kontaktu.");
    partnerId = created.Id;
  }
  if (customerId) {
    await db.execute(sql`
      INSERT INTO invoice_customer_refs (customer_id, provider, external_id)
      VALUES (${customerId}, ${IDOKLAD_PROVIDER}, ${String(partnerId)})
      ON CONFLICT (customer_id, provider) DO UPDATE SET external_id = EXCLUDED.external_id`);
  }
  return partnerId;
}

async function resolveCurrency(client: EshopIdokladClient): Promise<number> {
  const page = await client.list<{ Id: number; Code?: string | null }>("/Currencies", eqFilter("Code", "CZK"), 5);
  const czk = page.Items.filter((c) => c.Code === "CZK");
  if (czk.length !== 1) throw new IssueStop("V číselníku měn iDokladu se nepodařilo jednoznačně najít CZK.");
  return czk[0].Id;
}

async function resolvePaymentOption(client: EshopIdokladClient, method: string | null): Promise<number> {
  const rule = method ? PAYMENT_OPTION_MATCH[method] : undefined;
  if (!rule) throw new IssueStop(`Neznámý způsob úhrady „${method ?? "—"}“ — není jak ho zapsat do iDokladu.`);
  const page = await client.list<{ Id: number; Name?: string | null }>("/PaymentOptions");
  const matches = page.Items.filter((o) => rule.name.test(o.Name ?? ""));
  if (matches.length !== 1) {
    throw new IssueStop(
      `Způsob úhrady „${rule.label}“ se v číselníku iDokladu nepodařilo jednoznačně najít (nalezeno ${matches.length}).`
    );
  }
  return matches[0].Id;
}

/** Typ ceny a sazba u položek: podle výchozí faktury agendy (neplátce). */
function resolvePricing(defaults: Record<string, unknown>, agenda: { PreferredPriceType?: number | string | null }): ItemPricing {
  const item = Array.isArray(defaults.Items) ? (defaults.Items[0] as Record<string, unknown> | undefined) : undefined;
  return {
    priceType: num(item?.PriceType) ?? num(agenda.PreferredPriceType) ?? IDOKLAD_ENUMS.PriceType.WithVat,
    vatRateType: num(item?.VatRateType) ?? IDOKLAD_ENUMS.VatRateType.Zero,
  };
}

async function nextDocumentSerial(client: EshopIdokladClient, seriesId: string, day: string): Promise<number> {
  const numbers = await client.get<{
    Unique?: { DocumentSerialNumber?: number; DocumentNumber?: string; NumericSequenceId?: number } | null;
  }>("/NumericSequences/DocumentNumbers/IssuedInvoice", { date: day, numericSequenceId: seriesId });
  const unique = numbers?.Unique;
  if (!unique || String(unique.NumericSequenceId) !== seriesId || typeof unique.DocumentSerialNumber !== "number") {
    throw new IssueStop(`iDoklad nevrátil další číslo dokladu v řadě ${seriesId}.`);
  }
  if (!unique.DocumentNumber || !ESHOP_NUMBER_RE.test(unique.DocumentNumber)) {
    throw new IssueStop(`Další číslo v řadě ${seriesId} („${unique.DocumentNumber ?? "—"}“) neodpovídá formátu 9{RR}{NNNN}.`);
  }
  return unique.DocumentSerialNumber;
}

async function fetchPdf(client: EshopIdokladClient, externalId: string, invoiceNumber: string) {
  const base64 = await client.get<string>(`/Reports/IssuedInvoice/${externalId}/Pdf`);
  if (typeof base64 !== "string" || !base64) throw new IdokladApiError("iDoklad nevrátil PDF faktury.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new IdokladApiError("Odpověď iDokladu není PDF.");
  return {
    pdf: { filename: `faktura-${invoiceNumber}.pdf`, contentBase64: bytes.toString("base64"), invoiceNumber },
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

// ------------------------------------------------------------- stav v DB

type Claimed = { link_id: string; invoice_id: string; external_id: string | null; attempts: number; customer_id: string | null };

async function claim(db: Db, orderId: string): Promise<Claimed | null> {
  const rows = (
    await db.execute(sql`
      UPDATE invoice_provider_links l
      SET state = 'pending', attempts = l.attempts + 1,
          next_attempt_at = now() + ${sql.raw(`interval '${ISSUE_LEASE_MINUTES} minutes'`)}, updated_at = now()
      FROM invoices i
      WHERE l.invoice_id = i.id AND i.order_id = ${orderId} AND i.document_type = 'invoice' AND i.doc_state = 'draft'
        AND l.provider = ${IDOKLAD_PROVIDER} AND l.state IN ('dry_run', 'pending', 'failed')
        AND (l.next_attempt_at IS NULL OR l.next_attempt_at < now())
      RETURNING l.id AS link_id, l.invoice_id, l.external_id, l.attempts, i.customer_id`)
  ).rows as Claimed[];
  return rows[0] ?? null;
}

async function rememberExternal(db: Db, linkId: string, invoice: IdokladInvoice) {
  await db.execute(sql`
    UPDATE invoice_provider_links
    SET external_id = ${String(invoice.Id)}, external_number = ${invoice.DocumentNumber ?? null}, updated_at = now()
    WHERE id = ${linkId}`);
}

async function markFailed(db: Db, orderId: string, linkId: string, message: string, actor: InvoiceActor, externalId: string | null) {
  const error = message.slice(0, 500);
  const updated = (
    await db.execute(sql`
      UPDATE invoice_provider_links
      SET state = 'failed', last_error = ${error}, last_error_at = now(), next_attempt_at = NULL, updated_at = now()
      WHERE id = ${linkId} AND state = 'pending'
      RETURNING id`)
  ).rows;
  if (updated.length > 0) await db.execute(activitySql(orderId, actor, "invoice_issue_failed", { error, externalId }));
}

// ------------------------------------------------------------- vystavení

/** Je objednávka skutečně zaplacená? (stav objednávky i přepočet plateb) */
async function reallyPaid(db: Db, orderId: string): Promise<string | null> {
  const row = (
    await db.execute(sql`
      SELECT o.channel, o.payment_status, o.payment_vs, b.balance_state
      FROM orders o JOIN order_payment_balance b ON b.order_id = o.id
      WHERE o.id = ${orderId}`)
  ).rows[0] as { channel: string; payment_status: string; payment_vs: string | null; balance_state: string } | undefined;
  if (!row) return "Objednávka nebyla nalezena.";
  if (row.channel !== "eshop") return "Fakturu do iDokladu vystavuje e-shop jen k e-shopovým objednávkám.";
  if (row.payment_status !== "paid" || !["paid", "overpaid"].includes(row.balance_state)) {
    return "Objednávka není uhrazená celá — faktura se nevystaví.";
  }
  if (!row.payment_vs || !/^7\d{7}$/.test(row.payment_vs)) return "Objednávka nemá platný VS 7xxxxxxx.";
  return null;
}

export async function issueInvoice(db: Db, orderId: string, deps: IssueDeps = {}): Promise<IssueResult> {
  const env = deps.env ?? process.env;
  const actor = deps.actor ?? { type: "system", name: "Fakturace" };
  const gate = liveInvoicingGate(env);
  if (!gate.open) return { status: "skipped", reason: gate.reason };

  const unpaid = await reallyPaid(db, orderId);
  if (unpaid) return { status: "skipped", reason: unpaid };

  // návrh musí existovat (vznikne po zaplacení; tady pro jistotu)
  await prepareInvoiceDraft(db, orderId, { actor }, env);
  const issued = (
    await db.execute(sql`
      SELECT invoice_number FROM invoices
      WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`)
  ).rows[0] as { invoice_number: string } | undefined;
  if (issued) return { status: "already_issued", invoiceNumber: issued.invoice_number };

  const claimed = await claim(db, orderId);
  if (!claimed) return { status: "skipped", reason: "Faktura se právě vystavuje (nebo už je vystavená) — zkuste to za chvíli." };

  let externalId: string | null = claimed.external_id;
  try {
    // aktuální data objednávky → návrh (blokující problémy = stop bez sítě)
    const inputs = await loadDraftInputs(db, orderId);
    if (!inputs) throw new IssueStop("Objednávka nebyla nalezena.");
    const { draft, problems, payload } = buildDraftPayload(inputs, env);
    const blocking = blockingProblems(problems, "live");
    if (blocking.length > 0) throw new IssueStop(blocking.map((p) => p.message).join(" "));
    if (draft.numberSeriesId !== gate.seriesId) throw new IssueStop(`Návrh nemá řadu ${gate.seriesId}.`);
    if (!externalId) {
      await db.execute(sql`
        UPDATE invoice_provider_links SET request_payload = ${JSON.stringify(payload)}::jsonb, number_series = ${gate.seriesId}
        WHERE id = ${claimed.link_id}`);
    }
    const vs = draft.vs!;
    const day = draft.issueDate!;

    const client = new EshopIdokladClient({
      clientId: gate.clientId,
      clientSecret: gate.clientSecret,
      writesAllowed: true,
      env,
      fetchImpl: deps.fetchImpl,
    });
    const agenda = await assertAgenda(client);
    await assertSeries(client, gate.seriesId);

    // pojistka proti dvojí faktuře: známé ID, jinak hledání podle VS
    let invoice: IdokladInvoice | null = null;
    if (externalId) {
      invoice = await client.get<IdokladInvoice>(`/IssuedInvoices/${externalId}`);
    } else {
      invoice = await findByVs(client, vs);
    }
    const adopted = invoice !== null;

    if (!invoice) {
      const partnerId = await resolveContact(db, client, draft, claimed.customer_id);
      const currencyId = await resolveCurrency(client);
      const paymentOptionId = await resolvePaymentOption(client, draft.paymentMethod);
      const defaults = (await client.get<Record<string, unknown>>("/IssuedInvoices/Default")) ?? {};
      const documentSerialNumber = await nextDocumentSerial(client, gate.seriesId, day);
      const body = invoicePostBody(
        draft,
        {
          partnerId,
          numericSequenceId: Number(gate.seriesId),
          documentSerialNumber,
          currencyId,
          paymentOptionId,
          pricing: resolvePricing(defaults, agenda),
        },
        defaults
      );
      invoice = await client.post<IdokladInvoice>("/IssuedInvoices", body);
      if (!invoice?.Id) throw new IdokladApiError("iDoklad nevrátil ID nové faktury.");
    }
    if (adopted) {
      // nalezená faktura musí být naše (VS + číslo z řady E-shop Begina)
      assertOurInvoice(invoice, vs);
      externalId = String(invoice.Id);
      await rememberExternal(db, claimed.link_id, invoice);
    } else {
      // nová faktura: ID hned do DB — další pokus už ji nezaloží znovu
      externalId = String(invoice.Id);
      await rememberExternal(db, claimed.link_id, invoice);
      assertOurInvoice(invoice, vs);
    }
    const invoiceNumber = invoice.DocumentNumber!;

    if (!sameAmount(invoice.Prices?.TotalWithVat, draft.totalKc)) {
      throw new IssueStop(
        `Faktura ${invoiceNumber} v iDokladu má celkem ${invoice.Prices?.TotalWithVat ?? "—"} Kč, objednávka ${draft.totalKc} Kč — neoznačena jako uhrazená, nutná ruční kontrola.`
      );
    }
    if (num(invoice.Prices?.TotalVat) && invoice.Prices!.TotalVat !== 0) {
      throw new IssueStop(`Faktura ${invoiceNumber} v iDokladu obsahuje DPH — Begina je neplátce, nutná ruční kontrola.`);
    }

    // uhrazeno + kontrola
    if (!enumIs(invoice.PaymentStatus, IDOKLAD_ENUMS.PaymentStatus.Paid, "Paid")) {
      await client.put<boolean>(`/IssuedDocumentPayments/FullyPay/${externalId}`, { dateOfPayment: `${day} 12:00:00.000` });
      invoice = await client.get<IdokladInvoice>(`/IssuedInvoices/${externalId}`);
    }
    if (!enumIs(invoice.PaymentStatus, IDOKLAD_ENUMS.PaymentStatus.Paid, "Paid") || !sameAmount(invoice.Prices?.TotalPaid ?? draft.totalKc, draft.totalKc)) {
      throw new IssueStop(`Faktura ${invoiceNumber} se v iDokladu nepodařilo označit jako uhrazenou — nutná kontrola.`);
    }

    // PDF (selhání PDF nezruší vystavení — pošle se později)
    let pdf: InvoicePdf | null = null;
    let sha: string | null = null;
    try {
      const fetched = await fetchPdf(client, externalId, invoiceNumber);
      pdf = fetched.pdf;
      sha = fetched.sha256;
    } catch (error) {
      console.error("Fakturace: PDF faktury se nepodařilo stáhnout", orderId, error instanceof Error ? error.message : error);
    }

    const responseRef = {
      adopted,
      requests: client.requestCount,
      paymentStatus: "paid",
      pdf: pdf ? `idoklad:Reports/IssuedInvoice/${externalId}/Pdf` : null,
    };
    // konečný stav jedním příkazem: faktura vystavená + vazba + historie
    const done = (
      await db.execute(sql`
        WITH link AS (
          UPDATE invoice_provider_links
          SET state = 'issued', external_id = ${externalId}, external_number = ${invoiceNumber}, issued_at = now(),
              next_attempt_at = NULL, last_error = NULL, last_error_at = NULL, response_ref = ${JSON.stringify(responseRef)}::jsonb,
              pdf_storage_key = ${pdf ? `idoklad:Reports/IssuedInvoice/${externalId}/Pdf` : null},
              pdf_sha256 = ${sha}, pdf_fetched_at = ${pdf ? sql`now()` : sql`NULL`}, updated_at = now()
          WHERE id = ${claimed.link_id} AND state = 'pending'
          RETURNING invoice_id
        ), inv AS (
          UPDATE invoices SET doc_state = 'issued', invoice_number = ${invoiceNumber}, issued_at = now(),
                 paid_at = now(), updated_at = now()
          WHERE id IN (SELECT invoice_id FROM link) AND doc_state = 'draft'
          RETURNING id
        )
        INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
        SELECT ${orderId}, ${actor.type}, ${actor.type === "user" ? actor.userId : null}, ${actor.name}, 'invoice_issued',
               ${JSON.stringify({ invoiceNumber, externalId, adopted, series: gate.seriesId })}::jsonb
        FROM inv
        RETURNING id`)
    ).rows;
    if (done.length === 0) throw new IssueStop("Stav faktury se mezitím změnil — vystavení se nedokončilo, zkontrolovat.");
    return { status: "issued", invoiceNumber, externalId, adopted, pdf };
  } catch (error) {
    const message =
      error instanceof IssueStop || error instanceof IdokladApiError || error instanceof IdokladBlockedError
        ? error.message
        : `Neočekávaná chyba: ${error instanceof Error ? error.message : String(error)}`;
    console.error("Fakturace: vystavení v iDokladu selhalo", orderId, message);
    await markFailed(db, orderId, claimed.link_id, message, actor, externalId).catch((e) =>
      console.error("Fakturace: chybu vystavení se nepodařilo zapsat", orderId, e)
    );
    return { status: "failed", error: message, externalId };
  }
}

/** Jako issueInvoice, ale nikdy nevyhodí výjimku (po zaplacení — platba je uložená). */
export async function issueInvoiceSafe(db: Db, orderId: string, deps: IssueDeps = {}): Promise<IssueResult> {
  try {
    return await issueInvoice(db, orderId, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "neznámá chyba";
    console.error("Fakturace: vystavení selhalo před zápisem stavu", orderId, message);
    return { status: "failed", error: message, externalId: null };
  }
}

/** PDF už vystavené faktury (pro dodatečné odeslání e-mailem). Jen čtení. */
export async function loadIssuedPdf(db: Db, orderId: string, deps: IssueDeps = {}): Promise<InvoicePdf | null> {
  const gate = liveInvoicingGate(deps.env ?? process.env);
  if (!gate.open) return null;
  const row = (
    await db.execute(sql`
      SELECT l.external_id, i.invoice_number FROM invoices i
      JOIN invoice_provider_links l ON l.invoice_id = i.id AND l.state = 'issued'
      WHERE i.order_id = ${orderId} AND i.document_type = 'invoice' AND i.doc_state = 'issued'`)
  ).rows[0] as { external_id: string; invoice_number: string } | undefined;
  if (!row) return null;
  const client = new EshopIdokladClient({
    clientId: gate.clientId,
    clientSecret: gate.clientSecret,
    writesAllowed: false, // jen čtení PDF
    env: deps.env ?? process.env,
    fetchImpl: deps.fetchImpl,
  });
  return (await fetchPdf(client, row.external_id, row.invoice_number)).pdf;
}
