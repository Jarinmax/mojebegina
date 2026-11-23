// Ruční objednávky (channel „manual“) s vlastní fakturou (Lucie 23. 11. 2026):
// všechno je objednávka a faktura odchází, když zboží odjede. Při „Odesláno“
// (Předáno přepravci) se k ruční objednávce vystaví faktura — zaplacená
// („Uhrazeno – neplaťte“), nebo nezaplacená s QR kódem a VS = číslo faktury
// (platba se pak sama spáruje z Fio) — a odejde zákazníkovi z info@begina.cz
// se skrytou kopií na info@begina.cz. Nejvýš jednou.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { emailConfig, invoiceCopyRecipients, invoiceEmailSender, resolveRecipients, type EmailConfig } from "../email/config";
import { resendTransport, type EmailTransport } from "../email/resend";
import { PARTNER_EMAIL_SIGNATURE } from "../partnerMonthly";
import { suggestSalutation } from "../salutation";
import { recordInvoiceEmailed } from "../invoiceSentFlag";
import { parseCheckoutAddress } from "./draft";
import { ownInvoicingGate } from "./mode";
import { formatCzDay, formatKc, formatZip, ownSupplier, type OwnInvoiceSnapshot } from "./ownInvoice";
import { issueOwnDocument, markOwnDocumentSent, ownDocumentPdf, type OwnPdf } from "./ownIssue";
import type { InvoiceActor } from "./service";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const MANUAL_DUE_DAYS = 14;
const PRAGUE_DAY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });

type ManualOrderRow = {
  id: string;
  order_number: number | null;
  channel: string;
  fulfillment_status: string;
  payment_status: string;
  paid_at: Date | string | null;
  total_kc: number;
  shipping_kc: number;
  discount_kc: number;
  shipping_method_label: string | null;
  contact_name: string | null;
  contact_email: string | null;
  billing_name: string | null;
  billing_company: string | null;
  billing_ico: string | null;
  billing_dic: string | null;
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  recipient_name: string | null;
  recipient_company: string | null;
  recipient_address: string | null;
  org_name: string | null;
  org_billing_name: string | null;
  org_ico: string | null;
  org_dic: string | null;
  org_address: string | null;
};

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Snímek faktury z ruční objednávky (čistá funkce). Vrací chyby místo snímku, když něco chybí. */
export function manualOrderSnapshot(
  order: ManualOrderRow,
  items: { name: string; quantity: number; unit_price_kc: number; line_total_kc: number }[],
  today: string,
  env: Env = process.env
): { snapshot: OwnInvoiceSnapshot; problems: string[] } {
  const problems: string[] = [];
  const lines = items.map((i) => ({ name: i.name, quantity: Number(i.quantity), unitPriceKc: Number(i.unit_price_kc), totalKc: Number(i.line_total_kc) }));
  if (Number(order.shipping_kc) > 0) {
    const kc = Number(order.shipping_kc);
    lines.push({ name: order.shipping_method_label?.trim() || "Doprava", quantity: 1, unitPriceKc: kc, totalKc: kc });
  }
  if (Number(order.discount_kc) > 0) {
    const kc = Number(order.discount_kc);
    lines.push({ name: "Sleva", quantity: 1, unitPriceKc: -kc, totalKc: -kc });
  }
  if (items.length === 0) problems.push("Objednávka nemá žádné položky.");
  const sum = lines.reduce((a, l) => a + l.totalKc, 0);
  if (Math.round(sum * 100) !== Math.round(Number(order.total_kc) * 100)) problems.push(`Součet položek (${sum} Kč) nesedí s celkem objednávky (${order.total_kc} Kč).`);

  // Odběratel: fakturační údaje objednávky mají přednost, jinak karta zákazníka.
  const billingCompany = order.billing_company?.trim() && order.billing_ico?.trim() ? order.billing_company.trim() : null;
  const ico = (billingCompany ? order.billing_ico : order.org_ico)?.replace(/\s/g, "") || null;
  const companyName = billingCompany ?? (order.org_ico ? order.org_billing_name?.trim() || order.org_name?.trim() || null : null);
  const contact = order.billing_name?.trim() || order.contact_name?.trim() || null;
  const rawAddress = order.billing_street?.trim()
    ? `${order.billing_street.trim()}, ${(order.billing_zip ?? "").trim()} ${(order.billing_city ?? "").trim()}`
    : companyName
      ? order.org_address
      : order.recipient_address;
  const address = parseCheckoutAddress(rawAddress ?? null);
  const name = companyName ?? contact;
  if (!name) problems.push("Chybí odběratel (firma nebo jméno).");
  if (companyName && !address) problems.push(`Sídlo odběratele „${rawAddress ?? "—"}“ nejde rozdělit na ulici, PSČ a obec — doplňte ho na kartě zákazníka.`);

  const paid = order.payment_status === "paid";
  const paidDate = paid ? (order.paid_at ? PRAGUE_DAY.format(new Date(order.paid_at)) : today) : null;
  const delivery = order.recipient_address?.trim()
    ? [order.recipient_company, order.recipient_name].filter((v) => v && v.trim()).join(", ") + (order.recipient_company || order.recipient_name ? ", " : "") + order.recipient_address.trim()
    : null;
  return {
    problems,
    snapshot: {
      version: 1,
      kind: "invoice",
      correctsNumber: null,
      issueDate: today,
      dueDate: paid ? today : addDays(today, MANUAL_DUE_DAYS),
      paidDate,
      paymentMethod: "bank_transfer",
      vs: null, // VS = číslo faktury (QR i párování plateb z Fio)
      orderReference: order.order_number !== null ? String(order.order_number) : null,
      supplier: ownSupplier(env),
      customer: {
        kind: companyName ? "company" : "person",
        name: name ?? "",
        contactPerson: companyName && contact && contact !== companyName ? contact : null,
        street: address?.street ?? null,
        city: address?.city ?? null,
        zip: address ? formatZip(address.zip) : null,
        country: address ? "Česká republika" : null,
        ico: companyName ? ico : null,
        dic: companyName ? (billingCompany ? order.billing_dic : order.org_dic)?.trim() || null : null,
        email: order.contact_email?.trim().toLowerCase() || null,
      },
      delivery,
      lines,
      totalKc: Number(order.total_kc),
      note: null,
    },
  };
}

async function loadManualOrder(db: Db, orderId: string): Promise<ManualOrderRow | null> {
  return ((
    await db.execute(sql`
      SELECT o.id, o.order_number, o.channel, o.fulfillment_status, o.payment_status, o.paid_at, o.total_kc, o.shipping_kc, o.discount_kc,
             o.shipping_method_label, o.contact_name, o.contact_email, o.billing_name, o.billing_company, o.billing_ico, o.billing_dic,
             o.billing_street, o.billing_zip, o.billing_city, o.recipient_name, o.recipient_company, o.recipient_address,
             org.name AS org_name, NULLIF(btrim(org.billing_name), '') AS org_billing_name, org.ico AS org_ico, org.dic AS org_dic, org.registered_address AS org_address
      FROM orders o LEFT JOIN organizations org ON org.id = o.buyer_organization_id
      WHERE o.id = ${orderId}`)
  ).rows[0] as ManualOrderRow | undefined) ?? null;
}

export type ManualIssueResult =
  | { status: "issued"; invoiceNumber: string; documentId: string }
  | { status: "already_issued"; invoiceNumber: string; documentId: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/** Faktura k ruční objednávce (zaplacené i nezaplacené). Idempotentní. */
export async function issueOwnManualOrderInvoice(db: Db, orderId: string, deps: { env?: Env; actor?: InvoiceActor; today?: string } = {}): Promise<ManualIssueResult> {
  const env = deps.env ?? process.env;
  const actor = deps.actor ?? { type: "system", name: "Expedice" };
  const gate = ownInvoicingGate(env);
  if (!gate.open) return { status: "skipped", reason: gate.reason };
  const issued = (await db.execute(sql`
    SELECT i.invoice_number, d.id AS document_id FROM invoices i LEFT JOIN own_invoice_documents d ON d.invoice_id = i.id
    WHERE i.order_id = ${orderId} AND i.document_type = 'invoice' AND i.doc_state = 'issued'`)).rows[0] as { invoice_number: string; document_id: string | null } | undefined;
  if (issued) return { status: "already_issued", invoiceNumber: issued.invoice_number, documentId: issued.document_id };

  const order = await loadManualOrder(db, orderId);
  if (!order) return { status: "skipped", reason: "Objednávka nebyla nalezena." };
  if (order.channel !== "manual") return { status: "skipped", reason: "Není to ruční objednávka." };
  if (order.fulfillment_status === "cancelled") return { status: "skipped", reason: "Objednávka je stornovaná." };
  const external = (await db.execute(sql`
    SELECT metadata->>'externalInvoiceNumber' AS number FROM order_activity
    WHERE order_id = ${orderId} AND kind = 'created' AND metadata->>'externalInvoiceNumber' IS NOT NULL LIMIT 1`)).rows[0] as { number: string } | undefined;
  if (external) return { status: "skipped", reason: `K objednávce už existuje faktura ${external.number} vystavená mimo MojeBegina.` };
  const items = (await db.execute(sql`SELECT name, quantity, unit_price_kc, line_total_kc FROM order_items WHERE order_id = ${orderId} ORDER BY name`)).rows as {
    name: string;
    quantity: number;
    unit_price_kc: number;
    line_total_kc: number;
  }[];
  const { snapshot, problems } = manualOrderSnapshot(order, items, deps.today ?? PRAGUE_DAY.format(new Date()), env);
  if (problems.length) {
    const error = problems.join(" ");
    await db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      VALUES (${orderId}, 'system', NULL, ${actor.name}, 'invoice_issue_failed', ${JSON.stringify({ error, provider: "begina" })}::jsonb)`).catch(() => undefined);
    return { status: "failed", error };
  }
  try {
    // návrh faktury + vazba (zámek odeslání v afterPaid.ts používá invoice_provider_links)
    const draft = (await db.execute(sql`
      WITH inv AS (
        INSERT INTO invoices (order_id, origin, document_type, doc_state, total_kc, payment_vs)
        VALUES (${orderId}, 'manual', 'invoice', 'draft', ${snapshot.totalKc}, NULL)
        ON CONFLICT (order_id) WHERE document_type = 'invoice' AND doc_state <> 'void' DO NOTHING
        RETURNING id
      ), lnk AS (
        INSERT INTO invoice_provider_links (invoice_id, provider, state, number_series)
        SELECT id, 'idoklad', 'dry_run', 'begina' FROM inv RETURNING invoice_id
      )
      SELECT id FROM inv
      UNION ALL
      SELECT id FROM invoices WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'draft' AND NOT EXISTS (SELECT 1 FROM inv)`)).rows[0] as { id: string } | undefined;
    if (!draft) return { status: "failed", error: "Návrh faktury k objednávce se nepodařilo založit." };
    const doc = await issueOwnDocument(db, { snapshot, actorName: actor.name, invoiceId: draft.id, orderId, activity: { orderId, actor } });
    await ownDocumentPdf(db, doc.id).catch(() => null);
    return { status: "issued", invoiceNumber: doc.number, documentId: doc.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 400) : String(error);
    await db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      VALUES (${orderId}, 'system', NULL, ${actor.name}, 'invoice_issue_failed', ${JSON.stringify({ error: message, provider: "begina" })}::jsonb)`).catch(() => undefined);
    return { status: "failed", error: message };
  }
}

export function manualInvoiceEmail(snapshot: OwnInvoiceSnapshot, number: string, salutationName: string | null, bankAccount: string | null): { subject: string; text: string; html: string } {
  const salutation = suggestSalutation(salutationName);
  const hello = salutation ? `Dobrý den, ${salutation},` : "Dobrý den,";
  const paid = Boolean(snapshot.paidDate);
  const body = paid
    ? `v příloze posíláme fakturu č. ${number} k Vaší objednávce. Faktura je již uhrazená, nic dalšího neplaťte.`
    : `v příloze posíláme fakturu č. ${number} k Vaší objednávce. Prosíme o úhradu ${formatKc(snapshot.totalKc)} do ${formatCzDay(snapshot.dueDate)}${bankAccount ? ` na účet ${bankAccount}` : ""}, variabilní symbol ${number}. Nejjednodušší je naskenovat QR kód na faktuře v bankovní aplikaci.`;
  const [team, ...contacts] = PARTNER_EMAIL_SIGNATURE;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    subject: `Faktura ${number} – Begina`,
    text: `${hello}\n\n${body}\n\nDěkujeme za objednávku.\n\nS přátelským pozdravem\n${PARTNER_EMAIL_SIGNATURE.join("\n")}`,
    html: `<p>${esc(hello)}</p><p>${esc(body)}</p><p>Děkujeme za objednávku.</p><p><em>S přátelským pozdravem</em><br><strong>${esc(team)}</strong><br>${contacts.map(esc).join("<br>")}</p>`,
  };
}

export type ManualSendResult = { status: "sent"; invoiceNumber: string; to: string[] } | { status: "already_sent" } | { status: "not_sent"; reason: string; invoiceNumber?: string };

/** Při „Odesláno“: vystavit (když chybí) a poslat fakturu ruční objednávky zákazníkovi. */
export async function sendManualOrderInvoiceOnDispatch(
  db: Db,
  orderId: string,
  deps: { env?: Env; mailer?: { config: EmailConfig; transport: EmailTransport } | null; today?: string } = {}
): Promise<ManualSendResult> {
  const env = deps.env ?? process.env;
  const sentRow = (await db.execute(sql`
    SELECT pdf_sent_at FROM invoices WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`)).rows[0] as { pdf_sent_at: Date | null } | undefined;
  if (sentRow?.pdf_sent_at) return { status: "already_sent" };
  const issued = await issueOwnManualOrderInvoice(db, orderId, { env, today: deps.today });
  if (issued.status === "skipped") return { status: "not_sent", reason: issued.reason };
  if (issued.status === "failed") return { status: "not_sent", reason: issued.error };
  const documentId = issued.documentId;
  if (!documentId) return { status: "not_sent", reason: `Faktura ${issued.invoiceNumber} není vlastní faktura MojeBegina — pošlete ji ručně.`, invoiceNumber: issued.invoiceNumber };
  const mailer = deps.mailer === undefined ? (() => { const c = emailConfig(env); return c ? { config: c, transport: resendTransport(c.apiKey) } : null; })() : deps.mailer;
  if (!mailer) return { status: "not_sent", reason: "Odesílání e-mailů není zapnuté.", invoiceNumber: issued.invoiceNumber };

  // zámek: jen jeden odesílatel (stejný sloupec jako afterPaid.ts)
  const lease = (await db.execute(sql`
    UPDATE invoice_provider_links l SET next_attempt_at = now() + interval '5 minutes', updated_at = now()
    FROM invoices i
    WHERE l.invoice_id = i.id AND i.order_id = ${orderId} AND i.document_type = 'invoice' AND i.doc_state = 'issued'
      AND i.pdf_sent_at IS NULL AND (l.next_attempt_at IS NULL OR l.next_attempt_at < now())
    RETURNING l.id`)).rows as { id: string }[];
  if (lease.length === 0) return { status: "not_sent", reason: "Odesílání právě probíhá.", invoiceNumber: issued.invoiceNumber };
  try {
    const doc = (await db.execute(sql`SELECT number, snapshot FROM own_invoice_documents WHERE id = ${documentId}::uuid`)).rows[0] as { number: string; snapshot: OwnInvoiceSnapshot };
    const order = (await db.execute(sql`SELECT contact_name, billing_name FROM orders WHERE id = ${orderId}`)).rows[0] as { contact_name: string | null; billing_name: string | null };
    const email = doc.snapshot.customer.email;
    if (!email) return { status: "not_sent", reason: "Objednávka nemá e-mail zákazníka — fakturu pošlete ručně.", invoiceNumber: doc.number };
    const pdf: OwnPdf | null = await ownDocumentPdf(db, documentId);
    if (!pdf) return { status: "not_sent", reason: "PDF faktury se nepodařilo vykreslit.", invoiceNumber: doc.number };
    const resolved = resolveRecipients([email], mailer.config);
    const bcc = invoiceCopyRecipients(mailer.config, resolved.to);
    const sender = invoiceEmailSender(mailer.config);
    const message = manualInvoiceEmail(doc.snapshot, doc.number, order.contact_name ?? order.billing_name, doc.snapshot.supplier.bankAccount);
    const test = mailer.config.testRecipients !== null;
    const key = createHash("sha256").update(`manual-invoice-${documentId}`).digest("hex").slice(0, 32);
    const sent = await mailer.transport(
      {
        from: sender.from,
        to: resolved.to,
        ...(bcc.length ? { bcc } : {}),
        replyTo: sender.replyTo,
        subject: `${test ? "[TEST] " : ""}${message.subject}`,
        text: message.text,
        html: message.html,
        attachments: [{ filename: pdf.filename, contentBase64: pdf.contentBase64, contentType: "application/pdf" }],
      },
      key
    );
    if (!sent.ok) return { status: "not_sent", reason: `E-mail se nepodařilo odeslat: ${sent.error}`, invoiceNumber: doc.number };
    if (!test) {
      await db.execute(sql`UPDATE invoices SET pdf_sent_at = now(), updated_at = now() WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`);
      await markOwnDocumentSent(db, documentId);
      await recordInvoiceEmailed(db, [orderId], resolved.to, { userId: null, name: "MojeBegina (při odeslání)" });
    }
    return { status: "sent", invoiceNumber: doc.number, to: resolved.to };
  } finally {
    await db.execute(sql`UPDATE invoice_provider_links SET next_attempt_at = NULL, updated_at = now() WHERE id = ${lease[0].id}`).catch(() => undefined);
  }
}
