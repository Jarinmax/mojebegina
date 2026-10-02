"use server";

// E-shop 1.0 — odeslání objednávky. Cena se počítá výhradně na serveru
// z katalogu (validateCheckoutInput → priceCart), z formuláře se bere jen
// obsah košíku (sku + množství), kontaktní údaje a token objednávky.
//
// Uložení do Objednávek MojeBegina (lib/eshop/orderWrite.ts) běží JEN mimo
// Vercel Production (isOrderWriteEnabled). Platba kartou (Stripe Checkout)
// jen se Stripe nastaveným podle lib/eshop/stripe/config.ts — objednávka
// se nejdřív uloží jako nezaplacená, pak se zákazník přesměruje na Stripe.
// E-maily (lib/eshop/email/orderEmails.ts): u převodu hned po uložení,
// u karty až po potvrzení platby webhookem Stripe.
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { validateCheckoutInput, type CheckoutValue } from "@/lib/eshop/checkout";
import { isOrderWriteEnabled, parseOrderToken, saveEshopOrder } from "@/lib/eshop/orderWrite";
import { stripeConfig } from "@/lib/eshop/stripe/config";
import { getStripe } from "@/lib/eshop/stripe/client";
import { CARD_PAYMENT_METHOD, startCardPayment } from "@/lib/eshop/stripe/payment";
import { sendOrderEmails } from "@/lib/eshop/email/orderEmails";

export type CheckoutState =
  | { error: string }
  | {
      confirmation: CheckoutValue;
      /** id uložené objednávky; null = neuloženo (Production bez povolení) */
      savedOrderId: string | null;
      /** číslo objednávky; null = číslování vypnuté nebo neuloženo */
      orderNumber: number | null;
      /** potvrzení e-mailem: odešlo / selhalo (objednávka je i tak uložená) / e-maily vypnuté */
      email: "sent" | "failed" | "off";
    }
  | { redirectTo: string }
  | null;

/** Adresa aplikace pro návrat ze Stripe (Preview/Production má každý svou). */
async function currentBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function submitCheckoutAction(
  _prevState: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const field = (key: string) => String(formData.get(key) ?? "");

  // Past na roboty: pole je pro lidi skryté. Vyplněné = nic neukládat.
  if (field("website").trim() !== "") {
    return { error: "Objednávku se nepodařilo odeslat." };
  }

  const stripe = stripeConfig();
  const result = validateCheckoutInput(
    {
      cart: field("cart"),
      name: field("name"),
      email: field("email"),
      phone: field("phone"),
      shippingMethodId: field("shippingMethodId"),
      paymentMethodId: field("paymentMethodId"),
      street: field("street"),
      city: field("city"),
      zip: field("zip"),
      note: field("note"),
      termsAccepted: formData.get("termsAccepted") === "on",
      ageConfirmed: formData.get("ageConfirmed") === "on",
    },
    await getCatalogIndex(),
    { cardPaymentAvailable: stripe !== null }
  );

  if (!result.ok) {
    return { error: result.error };
  }

  if (!isOrderWriteEnabled()) {
    return { confirmation: result.value, savedOrderId: null, orderNumber: null, email: "off" };
  }

  const orderId = parseOrderToken(field("orderToken")) ?? randomUUID();
  try {
    const saved = await saveEshopOrder(db, orderId, result.value);
    if (!saved.ok) {
      return { error: saved.error };
    }
    const baseUrl = await currentBaseUrl();
    if (result.value.payment.id === CARD_PAYMENT_METHOD && stripe) {
      // Objednávka je uložená i když platbu nejde otevřít (výpadek Stripe) —
      // zákazník ji zaplatí znovu ze stránky objednávky.
      const fallback = `/eshop/objednavka/${saved.orderId}?platba=chyba`;
      try {
        const payment = await startCardPayment(
          db,
          getStripe(stripe).checkout.sessions,
          saved.orderId,
          baseUrl
        );
        return { redirectTo: payment.ok ? payment.url : fallback };
      } catch (error) {
        console.error("E-shop: platební stránku Stripe se nepodařilo otevřít", saved.orderId, error);
        return { redirectTo: fallback };
      }
    }
    // Jen u nově vzniklé objednávky (dvojí odeslání formuláře = žádný druhý
    // e-mail). Nikdy nevyhazuje výjimku — objednávka je už uložená.
    const emails = saved.alreadySaved ? [] : await sendOrderEmails(db, saved.orderId, "order_created", baseUrl);
    const customerEmail = emails.find((e) => e.template === "customer_confirmation");
    const email = customerEmail?.status === "sent" ? "sent" : customerEmail ? "failed" : "off";
    return { confirmation: result.value, savedOrderId: saved.orderId, orderNumber: saved.orderNumber, email };
  } catch (error) {
    console.error("E-shop: uložení objednávky selhalo", error);
    return { error: "Objednávku se nepodařilo uložit. Zkuste to prosím znovu za chvíli." };
  }
}
