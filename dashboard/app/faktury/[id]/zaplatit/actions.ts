"use server";

import { headers } from "next/headers";
import { requireCustomerContext } from "@/lib/data/dashboard";
import { getCustomerPayableInvoice } from "@/lib/data/customerInvoicePayments";
import { liveInvoicingGate } from "@/lib/eshop/invoicing/mode";
import { getStripe } from "@/lib/eshop/stripe/client";
import { stripeConfig } from "@/lib/eshop/stripe/config";
import { startCustomerInvoiceCardPayment } from "@/lib/eshop/stripe/customerInvoice";

export type InvoiceCardPaymentState = { error: string } | { redirectTo: string } | null;

export async function payInvoiceByCardAction(
  _previous: InvoiceCardPaymentState,
  formData: FormData
): Promise<InvoiceCardPaymentState> {
  const invoiceId = Number(formData.get("invoiceId"));
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return { error: "Neplatná faktura." };
  const { ctx, organizationId } = await requireCustomerContext();
  if (!organizationId) return { error: "Účet není propojený s organizací." };
  const config = stripeConfig();
  if (!config || !liveInvoicingGate().open) return { error: "Platba kartou teď není dostupná." };

  try {
    // Částku, stav i vlastnictví faktury čteme znovu ze serveru; klient posílá jen ID.
    const invoice = await getCustomerPayableInvoice(ctx, organizationId, invoiceId);
    if (!invoice) return { error: "Faktura nebyla nalezena." };
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const result = await startCustomerInvoiceCardPayment(
      getStripe(config).checkout.sessions,
      invoice,
      ctx.email,
      `${proto}://${host}`
    );
    return result.ok ? { redirectTo: result.url } : { error: result.error };
  } catch (error) {
    console.error("Platbu faktury kartou se nepodařilo otevřít", invoiceId, error);
    return { error: "Platební bránu se nepodařilo otevřít. Zkuste to prosím za chvíli." };
  }
}
