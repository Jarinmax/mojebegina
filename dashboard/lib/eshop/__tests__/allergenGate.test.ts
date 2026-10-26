// Objednatelnost podle ověřených alergenů (products.allergens):
//   [kódy] = ověřeno, obsahuje → objednatelný
//   []     = ověřeno, žádný povinně deklarovaný → objednatelný (NENÍ chyba)
//   null   = neověřeno → vidět, ale NEobjednatelný (košík, pokladna, náhradní objednávka)
// Integrační průchod pokladnou a náhradní objednávkou přes DB je
// v orderCancellation.test.ts („alergeny — tři stavy“).
import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "../catalogIndex";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { priceCart } from "../pricing";
import { isOrderable } from "../productRules";
import { expectedCatalogAfterSeed } from "../seedFromCatalog";
import type { Catalog, Product } from "../types";

const CONTAINS = "granatovy-bond"; // stav 1
const NONE = "kulajda"; // stav 2
const UNVERIFIED = "lady-carneval"; // stav 3

const ALLERGENS: Record<string, string[] | null> = {
  [CONTAINS]: ["oxid siřičitý a siřičitany"],
  [NONE]: [],
  [UNVERIFIED]: null,
};

function catalogWithStates(): Catalog {
  const catalog = expectedCatalogAfterSeed();
  return {
    ...catalog,
    products: catalog.products.map((product) =>
      product.slug in ALLERGENS ? { ...product, foodInfo: { ...product.foodInfo, allergens: ALLERGENS[product.slug] } } : product
    ),
  };
}

const index = createCatalogIndex(catalogWithStates());
const product = (slug: string): Product => index.getProduct(slug)!;

function checkout(cart: { sku: string; quantity: number }[]): CheckoutInput {
  return {
    cart: JSON.stringify(cart),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "osobni-odber",
    paymentMethodId: "prevod",
    street: "",
    city: "",
    zip: "",
    note: "",
    termsAccepted: true,
    ageConfirmed: true,
  };
}

describe("alergeny — objednatelnost (tři stavy)", () => {
  it("isOrderable: ověřený seznam i ověřený prázdný seznam ano, neověřené (null) ne", () => {
    expect(isOrderable(product(CONTAINS))).toBe(true);
    expect(isOrderable(product(NONE))).toBe(true);
    expect(isOrderable(product(UNVERIFIED))).toBe(false);
  });

  it("neověřený produkt zůstává v katalogu vidět (stránka produktu i kategorie)", () => {
    expect(index.getProduct(UNVERIFIED)).toBeDefined();
    expect(index.productsInCategory("koktejly").map((p) => p.slug)).toContain(UNVERIFIED);
  });

  it("priceCart (server): stav 1 a 2 projdou, stav 3 odmítne s důvodem", () => {
    expect(priceCart([{ sku: `${CONTAINS}-500ml`, quantity: 1 }], "osobni-odber", index).ok).toBe(true);
    expect(priceCart([{ sku: NONE, quantity: 1 }], "osobni-odber", index).ok).toBe(true);
    for (const sku of [`${UNVERIFIED}-500ml`, `${UNVERIFIED}-3l`]) {
      expect(priceCart([{ sku, quantity: 1 }], "osobni-odber", index)).toEqual({
        ok: false,
        error: 'Produkt "Lady Carneval" zatím nelze objednat — ověřujeme u něj alergeny. Odeberte ho prosím z košíku.',
      });
    }
  });

  it("priceCart: jediný neověřený produkt v košíku zablokuje celou objednávku", () => {
    expect(
      priceCart(
        [
          { sku: NONE, quantity: 2 },
          { sku: `${CONTAINS}-500ml`, quantity: 1 },
          { sku: `${UNVERIFIED}-500ml`, quantity: 1 },
        ],
        "osobni-odber",
        index
      )
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Lady Carneval/) });
  });

  it("validateCheckoutInput (pokladna i náhradní objednávka): neověřený produkt neprojde, ověřené ano", () => {
    expect(validateCheckoutInput(checkout([{ sku: `${UNVERIFIED}-500ml`, quantity: 1 }]), index)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/alergeny/),
    });
    const ok = validateCheckoutInput(
      checkout([
        { sku: NONE, quantity: 1 },
        { sku: `${CONTAINS}-500ml`, quantity: 1 },
      ]),
      index
    );
    expect(ok.ok).toBe(true);
  });

  it("seed (migrace 0014) má alergeny neověřené — bez ověření v DB by nic nešlo objednat", () => {
    const seeded = createCatalogIndex(expectedCatalogAfterSeed());
    expect(seeded.catalog.products.every((p) => p.foodInfo.allergens === null)).toBe(true);
    expect(priceCart([{ sku: NONE, quantity: 1 }], "osobni-odber", seeded).ok).toBe(false);
  });
});
