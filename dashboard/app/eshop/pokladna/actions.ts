"use server";

// E-shop 1.0 (náhled) — odeslání objednávky. Cena se počítá výhradně na
// serveru z katalogu (validateCheckoutInput → priceCart), z formuláře se
// bere jen obsah košíku (sku + množství) a kontaktní údaje.
//
// NÁHLED: objednávka se zatím NIKAM neukládá ani neodesílá — vrací se jen
// rekapitulace. DB je na zápis připravená (kroky 3–7: soukromý zákazník
// = orders.buyerOrganizationId NULL + contact_email, channel "eshop",
// vazba položky na balení, systémový záznam v historii); zápis sem přijde
// až jako samostatně schválený krok spolu s ochranou proti spamu
// a potvrzovacím e-mailem — viz ESHOP_ROADMAP.md.
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { validateCheckoutInput, type CheckoutValue } from "@/lib/eshop/checkout";

export type CheckoutState = { error: string } | { confirmation: CheckoutValue } | null;

export async function submitCheckoutAction(
  _prevState: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const field = (key: string) => String(formData.get(key) ?? "");

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
  return { confirmation: result.value };
}
