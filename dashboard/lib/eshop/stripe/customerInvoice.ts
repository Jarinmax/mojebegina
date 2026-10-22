import "server-only";

import { revalidateTag } from "next/cache";
import type Stripe from "stripe";
import { settleCustomerInvoice } from "@/lib/eshop/invoicing/customerInvoicePayment";
import type { CustomerPayableInvoice } from "@/lib/eshop/invoicing/customerInvoicePayment";
import type { CheckoutSessionsApi } from "./payment";

export const CUSTOMER_INVOICE_STRIPE_SOURCE = "mojebegina-idoklad-invoice";

export function buildCustomerInvoiceCheckoutParams(
  invoice: CustomerPayableInvoice,
  customerEmail: string | null,
  baseUrl: string
): Stripe.Checkout.SessionCreateParams {
  const amountHal = Math.round(invoice.amountDueKc * 100);
  const metadata = {
    source: CUSTOMER_INVOICE_STRIPE_SOURCE,
    invoiceId: String(invoice.id),
    partnerId: String(invoice.partnerId),
    amountHal: String(amountHal),
  };
  const returnUrl = new URL(`/faktury/${invoice.id}/zaplatit`, baseUrl).toString();
  return {
    mode: "payment",
    locale: "cs",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "czk",
        unit_amount: amountHal,
        product_data: { name: `Faktura Begina č. ${invoice.documentNumber}` },
      },
    }],
    client_reference_id: `idoklad-${invoice.id}`,
    metadata,
    payment_intent_data: { metadata },
    customer_email: customerEmail ?? undefined,
    success_url: `${returnUrl}?platba=ok`,
    cancel_url: `${returnUrl}?platba=zrusena`,
  };
}

export async function startCustomerInvoiceCardPayment(
  sessions: Pick<CheckoutSessionsApi, "create">,
  invoice: CustomerPayableInvoice,
  customerEmail: string | null,
  baseUrl: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (invoice.paid || invoice.amountDueKc <= 0) return { ok: false, error: "Faktura už je zaplacená." };
  const amountHal = Math.round(invoice.amountDueKc * 100);
  const session = await sessions.create(
    buildCustomerInvoiceCheckoutParams(invoice, customerEmail, baseUrl),
    { idempotencyKey: `customer-invoice-${invoice.id}-${amountHal}` }
  );
  return session.url ? { ok: true, url: session.url } : { ok: false, error: "Platební bránu se nepodařilo otevřít." };
}

export type CustomerInvoiceWebhookOutcome =
  | "invoice-paid"
  | "invoice-already-paid"
  | "invoice-amount-mismatch"
  | "invoice-mismatch"
  | "invoice-not-paid-yet"
  | "invoice-no-change";

type SessionLike = Pick<
  Stripe.Checkout.Session,
  "metadata" | "payment_status" | "amount_total" | "currency"
>;

export async function handleCustomerInvoiceStripeEvent(
  event: Pick<Stripe.Event, "type" | "data">
): Promise<CustomerInvoiceWebhookOutcome | null> {
  const session = event.data.object as SessionLike;
  if (session.metadata?.source !== CUSTOMER_INVOICE_STRIPE_SOURCE) return null;
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") return "invoice-no-change";
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return "invoice-no-change";
  if (session.payment_status !== "paid") return "invoice-not-paid-yet";

  const invoiceId = Number(session.metadata.invoiceId);
  const partnerId = Number(session.metadata.partnerId);
  const expectedHal = Number(session.metadata.amountHal);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !Number.isInteger(partnerId) || partnerId <= 0) return "invoice-mismatch";
  if (session.currency !== "czk" || session.amount_total === null || !Number.isInteger(expectedHal) || session.amount_total !== expectedHal) {
    return "invoice-amount-mismatch";
  }
  const result = await settleCustomerInvoice({ invoiceId, partnerId, amountHal: session.amount_total });
  if (result === "paid") {
    revalidateTag("idoklad-purchase-history", { expire: 0 });
    return "invoice-paid";
  }
  if (result === "already-paid") return "invoice-already-paid";
  if (result === "amount-mismatch") return "invoice-amount-mismatch";
  return "invoice-mismatch";
}
