"use server";

// E-shop 1.0 — odeslání objednávky. Cena se počítá výhradně na serveru
// z katalogu (validateCheckoutInput → priceCart), z formuláře se bere jen
// obsah košíku (sku + množství), kontaktní údaje a token objednávky.
//
// Uložení do Objednávek MojeBegina (lib/eshop/orderWrite.ts) běží JEN mimo
// Vercel Production (isOrderWriteEnabled). Platba kartou (Stripe Checkout)
// jen se Stripe nastaveným podle lib/eshop/stripe/config.ts — objednávka
// se nejdřív uloží jako nezaplacená, pak se zákazník přesměruje na Stripe.
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { validateCheckoutInput, type CheckoutValue } from "@/lib/eshop/checkout";
import { isOrderWriteEnabled, parseOrderToken, saveEshopOrder } from "@/lib/eshop/orderWrite";
import { stripeConfig } from "@/lib/eshop/stripe/config";
import { getStripe } from "@/lib/eshop/stripe/client";
import { CARD_PAYMENT_METHOD, startCardPayment } from "@/lib/eshop/stripe/payment";

export type CheckoutState =
  | { error: string }
  | {
      confirmation: CheckoutValue;
      /** id uložené objednávky; null = neuloženo (Production bez povolení) */
      savedOrderId: string | null;
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
    return { confirmation: result.value, savedOrderId: null };
  }

  const orderId = parseOrderToken(field("orderToken")) ?? randomUUID();
  try {
    const saved = await saveEshopOrder(db, orderId, result.value);
    if (!saved.ok) {
      return { error: saved.error };
    }
    if (result.value.payment.id === CARD_PAYMENT_METHOD && stripe) {
      // Objednávka je uložená i když platbu nejde otevřít (výpadek Stripe) —
      // zákazník ji zaplatí znovu ze stránky objednávky.
      const fallback = `/eshop/objednavka/${saved.orderId}?platba=chyba`;
      try {
        const payment = await startCardPayment(
          db,
          getStripe(stripe).checkout.sessions,
          saved.orderId,
          await currentBaseUrl()
        );
        return { redirectTo: payment.ok ? payment.url : fallback };
      } catch (error) {
        console.error("E-shop: platební stránku Stripe se nepodařilo otevřít", saved.orderId, error);
        return { redirectTo: fallback };
      }
    }
    return { confirmation: result.value, savedOrderId: saved.orderId };
  } catch (error) {
    console.error("E-shop: uložení objednávky selhalo", error);
    return { error: "Objednávku se nepodařilo uložit. Zkuste to prosím znovu za chvíli." };
  }
}
