"use server";

// E-shop 1.0 (náhled) — odeslání objednávky. Cena se počítá výhradně na
// serveru z katalogu (validateCheckoutInput → priceCart), z formuláře se
// bere jen obsah košíku (slug + množství) a kontaktní údaje.
//
// NÁHLED: objednávka se zatím NIKAM neukládá ani neodesílá — vrací se jen
// rekapitulace. Uložení do `orders` vyžaduje nejdřív rozhodnutí o tom,
// jak v DB evidovat koncového zákazníka bez IČO (orders.buyerOrganizationId
// je dnes NOT NULL), ochranu proti spamu a potvrzovací e-mail — viz
// ESHOP_ROADMAP.md.
import { validateCheckoutInput, type CheckoutValue } from "@/lib/eshop/checkout";

export type CheckoutState = { error: string } | { confirmation: CheckoutValue } | null;

export async function submitCheckoutAction(
  _prevState: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const field = (key: string) => String(formData.get(key) ?? "");

  const result = validateCheckoutInput({
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
  });

  if (!result.ok) {
    return { error: result.error };
  }
  return { confirmation: result.value };
}
