// ESHOP 1.0 — kdy a komu se posílají e-maily k objednávce.
//
//   převod, objednávka uložená      → zákazník: potvrzení (čeká na platbu)
//                                     + Begina: interní upozornění
//   karta, objednávka uložená       → NIC (zákazník je na platební stránce)
//   karta, Stripe potvrdil platbu   → zákazník: JEDNO potvrzení (zaplaceno)
//                                     + Begina: interní upozornění
//   karta, zrušená/propadlá platba  → nic (stránka objednávky nabízí
//                                     „Zaplatit znovu“, MojeBegina ji ukazuje
//                                     jako nezaplacenou)
//   ručně označeno Zaplaceno        → zákazník: „Platbu jsme přijali“ (max.
//     v MojeBegina                    jednou; u karty jen když mu ještě
//                                     nepřišlo potvrzení o zaplacení)
//   faktura vystavená až později    → zákazník: „Faktura k objednávce“ s PDF
//     (ostrý provoz, issue.ts)        (jen když PDF ještě neodešlo)
//
// Ostrý provoz fakturace: PDF faktury z iDokladu (option invoicePdf) se
// přiloží k potvrzení o zaplacení. iDoklad sám zákazníkovi nic neposílá.
//
// U převodu obsahuje potvrzení platební údaje a QR Platbu jako obrázek
// vložený do e-mailu přes Content-ID (cid:) — spolehlivější než externí
// obrázek (blokovaný do „zobrazit obrázky“) i než data: URL (Gmail
// a Outlook je nezobrazí).
//
// Proti duplicitám: volá se jen při skutečném vzniku objednávky
// (saveEshopOrder → alreadySaved = false) a při skutečném přepnutí na
// Zaplaceno (webhook → "paid"); navíc každá šablona jde k objednávce jen
// jednou (záznam email_sent v historii) a Resend dostane Idempotency-Key.
//
// E-mail se posílá AŽ PO uložení objednávky / platby a nikdy nevyhazuje
// výjimku: výpadek Resendu objednávku neshodí ani nesmaže, jen se do
// historie zapíše email_failed (MojeBegina ukáže varování).
import { and, asc, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { orderActivity, orderItems, orders } from "@/lib/db/schema";
import { ESHOP_ACTOR_NAME } from "../orderWrite";
import { emailConfig, resolveRecipients, type EmailConfig } from "./config";
import { resendTransport, type EmailTransport } from "./resend";
import {
  customerOrderEmail,
  customerPaymentReceivedEmail,
  internalOrderEmail,
  type EmailOrder,
  type RenderedEmail,
} from "./templates";
import { bankConfig, transferInfo, type BankConfig } from "../bankTransfer";
import { qrPng } from "../qr";
import type { Attachment, InlineImage } from "./resend";
import type { InvoicePdf } from "../invoicing/issue";

type Db = NeonHttpDatabase<typeof schema>;

export type OrderEmailTrigger = "order_created" | "payment_confirmed" | "payment_marked_paid" | "invoice_issued";
export type OrderEmailTemplate =
  | "customer_confirmation"
  | "internal_new_order"
  | "customer_payment_received"
  | "customer_invoice";

const QR_CONTENT_ID = "qr-platba";
export type OrderEmailOutcome = { template: OrderEmailTemplate; status: "sent" | "duplicate" | "failed" | "no-recipient" };

export const EMAIL_SENT = "email_sent";
export const EMAIL_FAILED = "email_failed";

type OrderForEmail = EmailOrder & { channel: string };

/** Které e-maily daná událost spouští (čistá funkce). */
export function emailsFor(
  order: Pick<OrderForEmail, "channel" | "paymentMethodCode" | "paymentStatus">,
  trigger: OrderEmailTrigger,
  alreadySentTemplates: ReadonlySet<string> = new Set()
): OrderEmailTemplate[] {
  if (order.channel !== "eshop") return [];
  const card = order.paymentMethodCode === "karta";
  if (trigger === "order_created") {
    return card ? [] : ["customer_confirmation", "internal_new_order"];
  }
  if (trigger === "payment_confirmed") {
    return card && order.paymentStatus === "paid" ? ["customer_confirmation", "internal_new_order"] : [];
  }
  if (trigger === "invoice_issued") {
    return order.paymentStatus === "paid" ? ["customer_invoice"] : [];
  }
  // Ručně označeno Zaplaceno. Kartou zaplacená objednávka už potvrzení
  // „je zaplacená“ dostala od webhooku — druhá zpráva by byla navíc.
  if (order.paymentStatus !== "paid") return [];
  if (card && alreadySentTemplates.has("customer_confirmation")) return [];
  return ["customer_payment_received"];
}

export async function loadOrderForEmail(db: Db, orderId: string): Promise<OrderForEmail | null> {
  const [order] = await db
    .select({
      id: orders.id,
      channel: orders.channel,
      orderNumber: orders.orderNumber,
      paymentVs: orders.paymentVs,
      contactName: orders.contactName,
      contactEmail: orders.contactEmail,
      recipientAddress: orders.recipientAddress,
      shippingMethodCode: orders.shippingMethodCode,
      shippingMethodLabel: orders.shippingMethodLabel,
      paymentMethodCode: orders.paymentMethodCode,
      paymentMethodLabel: orders.paymentMethodLabel,
      paymentStatus: orders.paymentStatus,
      orderedAt: orders.orderedAt,
      subtotalKc: orders.subtotalKc,
      discountKc: orders.discountKc,
      shippingKc: orders.shippingKc,
      totalKc: orders.totalKc,
      customerNote: orders.customerNote,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return null;
  const items = await db
    .select({
      name: orderItems.name,
      quantity: orderItems.quantity,
      unitPriceKc: orderItems.unitPriceKc,
      lineTotalKc: orderItems.lineTotalKc,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.name));
  return { ...order, items };
}

async function sentTemplates(db: Db, orderId: string): Promise<Set<string>> {
  const rows = await db
    .select({ template: sql<string>`${orderActivity.metadata}->>'template'` })
    .from(orderActivity)
    .where(and(eq(orderActivity.orderId, orderId), eq(orderActivity.kind, EMAIL_SENT)));
  return new Set(rows.map((r) => r.template));
}

async function qrImage(spayd: string | null): Promise<InlineImage | null> {
  if (!spayd) return null;
  try {
    const png = await qrPng(spayd);
    return { filename: "qr-platba.png", contentBase64: png.toString("base64"), contentId: QR_CONTENT_ID };
  } catch (error) {
    // Bez QR se e-mail pošle i tak — platební údaje jsou v něm textem.
    console.error("E-shop: QR kód se nepodařilo vytvořit", error);
    return null;
  }
}

async function record(db: Db, orderId: string, kind: string, metadata: Record<string, unknown>) {
  await db.insert(orderActivity).values({
    orderId,
    actorType: "system",
    authorUserId: null,
    authorName: ESHOP_ACTOR_NAME,
    kind,
    metadata,
  });
}

export type SendOrderEmailsOptions = {
  config?: EmailConfig | null;
  transport?: EmailTransport;
  bank?: BankConfig;
  /** PDF vystavené faktury — přiloží se k potvrzení o zaplacení */
  invoicePdf?: InvoicePdf | null;
};

/** Ke kterému e-mailu patří PDF faktury (jen zaplacená objednávka). */
function carriesInvoice(template: OrderEmailTemplate, paid: boolean): boolean {
  if (!paid) return false;
  return template === "customer_confirmation" || template === "customer_payment_received" || template === "customer_invoice";
}

export async function sendOrderEmails(
  db: Db,
  orderId: string,
  trigger: OrderEmailTrigger,
  baseUrl: string,
  options: SendOrderEmailsOptions = {}
): Promise<OrderEmailOutcome[]> {
  const config = options.config === undefined ? emailConfig() : options.config;
  if (!config) return [];
  const outcomes: OrderEmailOutcome[] = [];
  let planned: OrderEmailTemplate[] = [];
  try {
    const order = await loadOrderForEmail(db, orderId);
    if (!order) return [];
    const transport = options.transport ?? resendTransport(config.apiKey);
    const test = config.testRecipients !== null;

    const sent = await sentTemplates(db, orderId);
    const transfer = transferInfo(order, options.bank ?? bankConfig());
    planned = emailsFor(order, trigger, sent);
    for (const template of planned) {
      if (sent.has(template)) {
        outcomes.push({ template, status: "duplicate" });
        continue;
      }
      const customer = template !== "internal_new_order";
      const intended = customer ? (order.contactEmail ? [order.contactEmail] : []) : config.internalTo;
      if (intended.length === 0) {
        outcomes.push({ template, status: "no-recipient" });
        continue;
      }
      const { to, withheld } = resolveRecipients(intended, config);
      const ctx = { baseUrl, withheld, test };
      let rendered: RenderedEmail;
      let inlineImages: InlineImage[] = [];
      const pdf = carriesInvoice(template, order.paymentStatus === "paid") ? (options.invoicePdf ?? null) : null;
      if (template === "customer_invoice" && !pdf) {
        outcomes.push({ template, status: "failed" });
        continue;
      }
      const attachments: Attachment[] = pdf ? [{ filename: pdf.filename, contentBase64: pdf.contentBase64 }] : [];
      const invoiceNumber = pdf?.invoiceNumber ?? null;
      if (template === "customer_confirmation") {
        const qr = await qrImage(transfer?.spayd ?? null);
        if (qr) inlineImages = [qr];
        rendered = customerOrderEmail(order, { ...ctx, transfer, qrContentId: qr ? qr.contentId : null, invoiceNumber });
      } else if (template === "customer_payment_received" || template === "customer_invoice") {
        rendered = customerPaymentReceivedEmail(order, { ...ctx, invoiceNumber, late: template === "customer_invoice" });
      } else {
        rendered = internalOrderEmail(order, { ...ctx, transfer });
      }
      // Interní upozornění: odpověď jde rovnou zákazníkovi — v testovacím
      // režimu jen když je zákazník na seznamu (odpověď na [TEST] e-mail
      // nesmí odejít na adresu z testovací objednávky).
      const customerReply = order.contactEmail ? resolveRecipients([order.contactEmail], config) : null;
      const replyTo = customer
        ? config.replyTo
        : customerReply && customerReply.withheld.length === 0
          ? customerReply.to[0]
          : config.replyTo;

      const result = await transport(
        { from: config.from, to, replyTo, ...rendered, inlineImages, attachments },
        `eshop-${template}-${orderId}`
      );
      if (result.ok) {
        await record(db, orderId, EMAIL_SENT, {
          template,
          provider: "resend",
          messageId: result.id,
          to,
          ...(inlineImages.length ? { qr: true } : {}),
          ...(invoiceNumber ? { invoice: invoiceNumber } : {}),
          ...(test ? { test: true, withheld } : {}),
        });
        if (invoiceNumber) {
          await db.execute(sql`
            UPDATE invoices SET pdf_sent_at = now(), updated_at = now()
            WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued' AND pdf_sent_at IS NULL`);
        }
        outcomes.push({ template, status: "sent" });
      } else {
        console.error("E-shop: e-mail se nepodařilo odeslat", orderId, template, result.error);
        await record(db, orderId, EMAIL_FAILED, { template, provider: "resend", to, error: result.error.slice(0, 300) });
        outcomes.push({ template, status: "failed" });
      }
    }
  } catch (error) {
    // Ani chyba při čtení/zápisu historie nesmí shodit objednávku nebo webhook.
    console.error("E-shop: e-maily k objednávce selhaly", orderId, trigger, error);
    for (const template of planned) {
      if (!outcomes.some((o) => o.template === template)) outcomes.push({ template, status: "failed" });
    }
  }
  return outcomes;
}
