// ESHOP 1.0 — OSTRÉ vystavení e-shopové faktury v iDokladu.
//
// JEDINÝ vystavovací motor pro oba ostré režimy (mode.ts): „on“ ho spustí
// automaticky po zaplacení (afterPaid.ts), „manual“ jen výslovnou akcí
// oprávněného uživatele v detailu objednávky. Spouští se jen při otevřené
// bráně ostrého provozu (liveInvoicingGate — Vercel Production + přepínač
// manual/on + řada 7277293 + přístupové údaje). Jinak se nic nevolá
// a vrátí se „skipped“. Na Preview proto nikdy nevznikne ani jeden
// požadavek — ani s „manual“, ani s „on“.
//
// Pojistky (schválené vedením 7. 10. 2026):
//   1. jen skutečně zaplacená e-shopová objednávka (orders.payment_status
//      = paid A ZÁROVEŇ přepočet plateb order_payment_balance = paid/overpaid),
//   2+3. před KAŽDÝM pokusem kontrola iDokladu (preflight.ts, jen čtení):
//      přihlášení, agenda Begina (IČO 74337297), neplátce DPH, CZK, CZ,
//      převod / karta / hotově (ne dobírka), řada 7277293 „E-shop Begina“
//      (vydané faktury, ne výchozí), další číslo, typ ceny. Neprojde-li
//      kterákoli, faktura se nevystaví (žádné varování k přeskočení),
//   4. VS faktury = payment_vs objednávky (7xxxxxxx); u objednávky importované
//      z WooCommerce číslo objednávky ve WooCommerce (draft.invoiceVsFor),
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
import { blockingProblems, invoiceVsFor, isInvoiceableOrder, type InvoiceDraft } from "./draft";
import { IDOKLAD_ENUMS, IDOKLAD_PROVIDER, contactPostBody, invoicePostBody, paidDayOf, vsSearchFromDay } from "./idoklad";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError, eqFilter, issuedInvoiceFilter, sinceDayFilter } from "./idokladHttp";
import { ESHOP_SERIES, liveInvoicingGate } from "./mode";
import { ESHOP_NUMBER_RE, preflightFailureSummary, runIdokladPreflight } from "./preflight";
import { activitySql, buildDraftPayload, loadDraftInputs, prepareInvoiceDraft, type InvoiceActor } from "./service";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const ISSUE_LEASE_MINUTES = 10;

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
  NumericSequenceId?: number | null;
  VariableSymbol?: string | null;
  DateOfIssue?: string | null;
  OrderNumber?: string | null;
  Description?: string | null;
  PaymentStatus?: number | string | null;
  Prices?: { TotalWithVat?: number | null; TotalVat?: number | null; TotalPaid?: number | null } | null;
};

function enumIs(value: unknown, numeric: number, name: string): boolean {
  return value === numeric || value === name || value === String(numeric);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sameAmount(a: unknown, kc: number): boolean {
  return typeof a === "number" && Math.abs(a - kc) < 0.005;
}

// ------------------------------------------------------------- kontroly iDokladu

/** Nejvýš tolik stran (po 100) faktur od vsSearchFromDay projde hledání VS. */
const VS_SEARCH_PAGES = 10;

/**
 * Faktura s VS v iDokladu (pojistka proti dvojí faktuře). iDoklad podle VS
 * filtrovat neumí (ISSUED_INVOICE_FILTER_COLUMNS) — projdou se všechny vydané
 * faktury (jakákoli řada, jakýkoli odběratel) vystavené od vsSearchFromDay
 * (VS_LOOKBACK_DAYS dní před úhradou) a VS se porovná tady. Víc stran než VS_SEARCH_PAGES = stop.
 */
async function findByVs(client: EshopIdokladClient, vs: string, day: string): Promise<IdokladInvoice | null> {
  const fromDay = vsSearchFromDay(day);
  const filter = issuedInvoiceFilter(sinceDayFilter("DateOfIssue", fromDay));
  const matches: IdokladInvoice[] = [];
  for (let page = 1; page <= VS_SEARCH_PAGES; page += 1) {
    const result = await client.list<IdokladInvoice>("/IssuedInvoices", filter, 100, page);
    matches.push(...result.Items.filter((i) => (i.VariableSymbol ?? "").trim() === vs));
    if (page >= result.TotalPages || result.Items.length === 0) break;
    if (page === VS_SEARCH_PAGES) {
      throw new IssueStop(`V iDokladu je od ${fromDay} víc než ${VS_SEARCH_PAGES * 100} faktur — VS ${vs} nejde ověřit, nutná ruční kontrola.`);
    }
  }
  if (matches.length > 1) {
    throw new IssueStop(`V iDokladu je víc vydaných faktur s VS ${vs} — nutná ruční kontrola, nic se nevystavilo.`);
  }
  return matches[0] ?? null;
}

/**
 * Faktura z iDokladu musí být naše: VS, číslo 9RRNNNN a řada 7277293.
 * Řada se NIKDY nepředpokládá: odpověď iDokladu ji u faktury obvykle
 * neuvádí (IssuedInvoiceGetModel / ListGetModel v oficiálním SDK pole
 * NumericSequenceId nemají). Chybí-li, hledá se faktura mezi doklady řady
 * 7277293 (filtr NumericSequenceId~eq~ — ověřený v Production auditem
 * číslování 23. 10. 2026; složený filtr iDokladu ostře ověřený není);
 * když v řadě není — nebo dotaz selže — je to STOP: faktura se nevede jako
 * vystavená, neoznačí se uhrazená a nic se nepošle.
 */
async function assertOurInvoice(client: EshopIdokladClient, invoice: IdokladInvoice, vs: string) {
  if (invoice.VariableSymbol !== vs) {
    throw new IssueStop(`Faktura ${invoice.Id} v iDokladu má jiný VS (${invoice.VariableSymbol ?? "—"}) — nutná ruční kontrola.`);
  }
  const label = invoice.DocumentNumber ?? String(invoice.Id);
  if (invoice.NumericSequenceId != null && String(invoice.NumericSequenceId) !== ESHOP_SERIES.id) {
    throw new IssueStop(
      `Faktura ${label} v iDokladu není z řady E-shop Begina (${ESHOP_SERIES.id}), ale z řady ${invoice.NumericSequenceId} — nutná ruční kontrola.`
    );
  }
  if (!invoice.DocumentNumber || !ESHOP_NUMBER_RE.test(invoice.DocumentNumber)) {
    throw new IssueStop(
      `Faktura s VS ${vs} v iDokladu existuje, ale její číslo ${invoice.DocumentNumber ?? "—"} není z řady E-shop Begina — nutná ruční kontrola.`
    );
  }
  if (invoice.NumericSequenceId == null) {
    let confirmed = false;
    try {
      const filter = issuedInvoiceFilter(eqFilter("NumericSequenceId", ESHOP_SERIES.id));
      for (let page = 1; page <= SERIES_CONFIRM_PAGES && !confirmed; page += 1) {
        const result = await client.list<{ Id: number }>("/IssuedInvoices", filter, 100, page);
        confirmed = result.Items.some((i) => i.Id === invoice.Id);
        if (page >= result.TotalPages || result.Items.length === 0) break;
      }
    } catch (error) {
      throw new IssueStop(
        `Řadu faktury ${label} v iDokladu nejde ověřit (${error instanceof Error ? error.message : String(error)}) — nutná ruční kontrola.`
      );
    }
    if (!confirmed) {
      throw new IssueStop(`Faktura ${label} v iDokladu není potvrzeně v řadě E-shop Begina (${ESHOP_SERIES.id}) — nutná ruční kontrola.`);
    }
  }
}

/** Nejvýš tolik stran (po 100) dokladů řady E-shop Begina projde ověření řady nové faktury. */
const SERIES_CONFIRM_PAGES = 10;

/** Nejvýš tolik stran (po 100) faktur jedné firmy projde kontrola duplicit. */
const COMPANY_INVOICE_PAGES = 5;

/**
 * Firma: skutečná duplicita mimo MojeBegina (např. ruční faktura Lucie
 * k téže objednávce ve výchozí řadě). Projdou se faktury této firmě
 * vystavené v den úhrady nebo později (jakákoli řada):
 *   • vystavené MojeBegina (ID uložené u jiné objednávky) → v pořádku,
 *     patří jiným objednávkám (další objednávky firmy se neblokují),
 *   • cizí faktura odkazující na tuto objednávku (VS, číslo objednávky,
 *     číslo v popisu) → STOP — duplicita,
 *   • cizí faktura se stejnou částkou → STOP — nejasné, ruční kontrola,
 *   • ostatní cizí faktury (jiná částka, jiný odkaz) → jiné objednávky.
 * STOP platí jen pro toto vystavení; po kontrole se dá vystavit znovu.
 */
async function assertNoForeignDuplicate(
  db: Db,
  client: EshopIdokladClient,
  partnerId: number,
  check: { fromDay: string; vs: string; orderReference: string | null; totalKc: number }
) {
  const all: IdokladInvoice[] = [];
  for (let page = 1; page <= COMPANY_INVOICE_PAGES; page += 1) {
    const result = await client.list<IdokladInvoice>("/IssuedInvoices", issuedInvoiceFilter(eqFilter("PartnerId", String(partnerId))), 100, page);
    all.push(...result.Items);
    if (page >= result.TotalPages || result.Items.length === 0) break;
    if (page === COMPANY_INVOICE_PAGES) {
      throw new IssueStop(`Firma má v iDokladu víc než ${COMPANY_INVOICE_PAGES * 100} faktur — duplicitu nejde ověřit, nutná ruční kontrola.`);
    }
  }
  const recent = all.filter((i) => (i.DateOfIssue ?? "").slice(0, 10) >= check.fromDay);
  if (recent.length === 0) return;
  const ids = recent.map((i) => String(i.Id));
  const ours = new Set(
    (
      (
        await db.execute(sql`
          SELECT external_id FROM invoice_provider_links
          WHERE provider = ${IDOKLAD_PROVIDER} AND external_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
      ).rows as { external_id: string }[]
    ).map((r) => r.external_id)
  );
  const ref = check.orderReference;
  const refRe = ref ? new RegExp(`(^|\\D)${ref}(\\D|$)`) : null;
  for (const invoice of recent) {
    if (ours.has(String(invoice.Id))) continue;
    const label = invoice.DocumentNumber ?? String(invoice.Id);
    const refersToOrder =
      invoice.VariableSymbol === check.vs ||
      (ref !== null && (invoice.OrderNumber ?? "").trim() === ref) ||
      (refRe !== null && refRe.test(invoice.Description ?? ""));
    if (refersToOrder) {
      throw new IssueStop(`V iDokladu už je faktura ${label} k této objednávce (${ref ?? check.vs}) — mimo MojeBegina. Nic se nevystavilo.`);
    }
    if (sameAmount(invoice.Prices?.TotalWithVat, check.totalKc)) {
      throw new IssueStop(
        `V iDokladu je faktura ${label} této firmě ze dne ${(invoice.DateOfIssue ?? "").slice(0, 10)} se stejnou částkou ${check.totalKc} Kč, ` +
          "vystavená mimo MojeBegina — zkontrolovat, zda není k této objednávce. Nic se nevystavilo."
      );
    }
  }
}

async function resolveContact(
  db: Db,
  client: EshopIdokladClient,
  draft: InvoiceDraft,
  customerId: string | null,
  countryId: number
): Promise<number> {
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
  // 2. hledání: firma podle IČO (víc kontaktů se stejným IČO = stop), osoba podle e-mailu
  let partnerId: number | null = null;
  const ico = draft.customer.kind === "company" ? draft.customer.ico : null;
  if (ico) {
    const found = await client.list<{ Id: number; IdentificationNumber?: string | null }>(
      "/Contacts",
      eqFilter("IdentificationNumber", ico),
      20
    );
    const same = found.Items.filter((c) => (c.IdentificationNumber ?? "").replace(/\s/g, "") === ico);
    if (same.length > 1) {
      throw new IssueStop(`V iDokladu je víc kontaktů s IČO ${ico} (${same.map((c) => c.Id).join(", ")}) — nutná ruční kontrola, nic se nevystavilo.`);
    }
    partnerId = same[0]?.Id ?? null;
  } else {
    const email = draft.customer.email;
    if (!email) throw new IssueStop("Zákazník nemá e-mail — kontakt v iDokladu nejde dohledat.");
    const found = await client.list<{ Id: number; Email?: string | null }>("/Contacts", eqFilter("Email", email), 20);
    const same = found.Items.filter((c) => (c.Email ?? "").trim().toLowerCase() === email).sort((a, b) => a.Id - b.Id);
    partnerId = same[0]?.Id ?? null;
  }
  // 3. založení
  if (!partnerId) {
    // země CZ z kontroly iDokladu (preflight.ts)
    const created = await client.post<{ Id: number }>("/Contacts", contactPostBody(draft, { countryId }));
    if (!created?.Id) throw new IdokladApiError("iDoklad nevrátil ID nového kontaktu.");
    partnerId = created.Id;
  }
  if (customerId) {
    // Vazba zákazník → kontakt je jen zkratka pro příště. Když už kontakt
    // patří jinému zákazníkovi MojeBegina (stejný e-mail u osoby i firmy)
    // nebo se změnil, nic se nepřepisuje a vystavení pokračuje — příště se
    // kontakt najde znovu podle e-mailu.
    await db
      .execute(sql`
        INSERT INTO invoice_customer_refs (customer_id, provider, external_id)
        VALUES (${customerId}, ${IDOKLAD_PROVIDER}, ${String(partnerId)})
        ON CONFLICT DO NOTHING`)
      .catch((error: unknown) => console.error("Fakturace: vazbu na kontakt iDokladu se nepodařilo uložit", customerId, error));
  }
  return partnerId;
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

/** Lze k objednávce vystavit fakturu? (zaplacení, storno, faktura vystavená mimo MojeBegina) */
export async function reallyPaid(db: Db, orderId: string): Promise<string | null> {
  const row = (
    await db.execute(sql`
      SELECT o.channel, o.payment_status, o.payment_vs, o.external_woocommerce_id, o.fulfillment_status, b.balance_state
      FROM orders o JOIN order_payment_balance b ON b.order_id = o.id
      WHERE o.id = ${orderId}`)
  ).rows[0] as
    | {
        channel: string;
        payment_status: string;
        payment_vs: string | null;
        external_woocommerce_id: string | null;
        fulfillment_status: string;
        balance_state: string;
      }
    | undefined;
  if (!row) return "Objednávka nebyla nalezena.";
  const order = { channel: row.channel, paymentVs: row.payment_vs, externalWooCommerceId: row.external_woocommerce_id };
  if (!isInvoiceableOrder(order)) {
    return "Fakturu do iDokladu vystavuje MojeBegina jen k e-shopovým objednávkám a objednávkám importovaným z WooCommerce.";
  }
  if (row.fulfillment_status === "cancelled") return "Objednávka je stornovaná — faktura se nevystaví.";
  // faktura vystavená mimo MojeBegina (zapsaná při příjmu objednávky přes
  // asistenta, lib/data/orderIntake.ts) — druhá faktura nesmí vzniknout
  const external = (
    await db.execute(sql`
      SELECT metadata->>'externalInvoiceNumber' AS number FROM order_activity
      WHERE order_id = ${orderId} AND kind = 'created' AND metadata->>'externalInvoiceNumber' IS NOT NULL LIMIT 1`)
  ).rows[0] as { number: string } | undefined;
  if (external) return `K objednávce už existuje faktura ${external.number} vystavená mimo MojeBegina — MojeBegina další fakturu nevystaví.`;
  if (row.payment_status !== "paid" || !["paid", "overpaid"].includes(row.balance_state)) {
    return "Objednávka není uhrazená celá — faktura se nevystaví.";
  }
  if (!invoiceVsFor(order)) return "Objednávka nemá platný VS (7xxxxxxx, u importu číslo objednávky z WooCommerce).";
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
    // den vystavení (dnes) — další číslo řady; den úhrady — duplicity a „uhrazeno“
    const day = draft.issueDate!;
    const paidDay = paidDayOf(draft)!;

    const client = new EshopIdokladClient({
      clientId: gate.clientId,
      clientSecret: gate.clientSecret,
      applicationId: gate.applicationId,
      writesAllowed: true,
      env,
      fetchImpl: deps.fetchImpl,
    });
    // kontrola iDokladu před KAŽDÝM pokusem (jen čtení) — stejná jako
    // ruční „Kontrola připojení iDokladu“; cokoli neprojde = nic se nezapíše
    const preflight = await runIdokladPreflight(client, { seriesId: gate.seriesId, day });
    if (!preflight.ok || !preflight.resolved) throw new IssueStop(preflightFailureSummary(preflight));
    const resolved = preflight.resolved;

    // pojistka proti dvojí faktuře: známé ID, jinak hledání podle VS
    let invoice: IdokladInvoice | null = null;
    if (externalId) {
      invoice = await client.get<IdokladInvoice>(`/IssuedInvoices/${externalId}`);
    } else {
      invoice = await findByVs(client, vs, paidDay);
    }
    const adopted = invoice !== null;

    if (!invoice) {
      const method = draft.paymentMethod ?? "";
      const paymentOptionId = resolved.paymentOptionIds[method];
      if (!paymentOptionId) throw new IssueStop(`Neznámý způsob úhrady „${method || "—"}“ — není jak ho zapsat do iDokladu.`);
      const partnerId = await resolveContact(db, client, draft, claimed.customer_id, resolved.countryId);
      if (draft.customer.kind === "company") {
        await assertNoForeignDuplicate(db, client, partnerId, {
          fromDay: paidDay,
          vs,
          orderReference: draft.orderReference ?? null,
          totalKc: draft.totalKc,
        });
      }
      const body = invoicePostBody(
        draft,
        {
          partnerId,
          numericSequenceId: Number(gate.seriesId),
          documentSerialNumber: resolved.next.serial,
          currencyId: resolved.currencyId,
          paymentOptionId,
          pricing: resolved.pricing,
        },
        resolved.defaults
      );
      invoice = await client.post<IdokladInvoice>("/IssuedInvoices", body);
      if (!invoice?.Id) throw new IdokladApiError("iDoklad nevrátil ID nové faktury.");
    }
    if (adopted) {
      // nalezená faktura musí být naše (VS + číslo z řady E-shop Begina)
      await assertOurInvoice(client, invoice, vs);
      externalId = String(invoice.Id);
      await rememberExternal(db, claimed.link_id, invoice);
    } else {
      // nová faktura: ID hned do DB — další pokus už ji nezaloží znovu
      externalId = String(invoice.Id);
      await rememberExternal(db, claimed.link_id, invoice);
      await assertOurInvoice(client, invoice, vs);
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
      await client.put<boolean>(`/IssuedDocumentPayments/FullyPay/${externalId}`, { dateOfPayment: `${paidDay} 12:00:00.000` });
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
      trigger: gate.trigger,
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
               ${JSON.stringify({ invoiceNumber, externalId, adopted, series: gate.seriesId, trigger: gate.trigger })}::jsonb
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
    applicationId: gate.applicationId,
    writesAllowed: false, // jen čtení PDF
    env: deps.env ?? process.env,
    fetchImpl: deps.fetchImpl,
  });
  return (await fetchPdf(client, row.external_id, row.invoice_number)).pdf;
}
