"use server";

// E-shop 1.0 — odeslání objednávky. Cena se počítá výhradně na serveru
// z katalogu (validateCheckoutInput → priceCart), z formuláře se bere jen
// obsah košíku (sku + množství), kontaktní údaje a token objednávky.
//
// Uložení do Objednávek MojeBegina (lib/eshop/orderWrite.ts) běží JEN mimo
// Vercel Production (isOrderWriteEnabled). Zatím bez platební brány, bez
// potvrzovacího e-mailu a bez čísla objednávky.
import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { validateCheckoutInput, type CheckoutValue } from "@/lib/eshop/checkout";
import { isOrderWriteEnabled, parseOrderToken, saveEshopOrder } from "@/lib/eshop/orderWrite";

export type CheckoutState =
  | { error: string }
  | {
      confirmation: CheckoutValue;
      /** id uložené objednávky; null = neuloženo (Production bez povolení) */
      savedOrderId: string | null;
    }
  | null;

export async function submitCheckoutAction(
  _prevState: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const field = (key: string) => String(formData.get(key) ?? "");

  // Past na roboty: pole je pro lidi skryté. Vyplněné = nic neukládat.
  if (field("website").trim() !== "") {
    return { error: "Objednávku se nepodařilo odeslat." };
  }

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
    await getCatalogIndex()
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
    return { confirmation: result.value, savedOrderId: saved.orderId };
  } catch (error) {
    console.error("E-shop: uložení objednávky selhalo", error);
    return { error: "Objednávku se nepodařilo uložit. Zkuste to prosím znovu za chvíli." };
  }
}
