// Volitelná krabice v pokladně (12. 11. 2026): 19 Kč a 126 g za každé
// balení 3 l mimo sirupy; sirupy mají krabici vždy (v hmotnosti, skript 101).
import { describe, expect, it } from "vitest";
import { BOX_NAME, BOX_PRICE_KC, BOX_SKU, BOX_WEIGHT_GRAMS, boxCount, boxWeightLines, clampBoxes, isBoxEligible } from "../boxOption";
import { createCatalogIndex } from "../catalogIndex";
import { priceCart, withCoupons } from "../pricing";
import { buildEshopOrderRows } from "../orderWrite";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { reorderLines } from "../customerHandoff";
import type { Catalog, Product, Variant } from "../types";

const variant = (sku: string, priceKc: number, volumeMl: number, weightGrams: number): Variant => ({
  sku,
  label: volumeMl === 3000 ? "3 l" : `${volumeMl} ml`,
  detail: null,
  description: null,
  priceKc,
  volumeMl,
  servings: null,
  weightGrams,
});

const product = (slug: string, category: string, variants: Variant[], isAgeRestricted = false): Product => ({
  slug,
  name: slug,
  category,
  shortDescription: null,
  highlights: [],
  description: [],
  taste: null,
  warnings: [],
  image: null,
  variants,
  alcoholPercent: null,
  isAgeRestricted,
  foodInfo: { ingredients: null, allergens: [], nutritionPer100g: null, storage: null, shelfLife: null },
});

const catalog: Catalog = {
  categories: ["polevky", "sirupy", "caje", "koktejly"].map((slug) => ({
    slug,
    name: slug,
    image: null,
    intro: [],
    detailSections: [],
    ageRestricted: slug === "koktejly",
  })),
  products: [
    product("kulajda", "polevky", [variant("kulajda", 379, 3000, 3000)]),
    product("caj", "caje", [variant("caj-3l", 299, 3000, 3000)]),
    product("saman", "sirupy", [variant("saman-3l", 549, 3000, 3826), variant("saman-650", 199, 650, 780)]),
    product("svarak", "koktejly", [variant("svarak-500", 149, 500, 500)], true),
  ],
};
const index = createCatalogIndex(catalog);

describe("pravidla krabice", () => {
  it("cena 19 Kč, hmotnost 126 g", () => {
    expect(BOX_PRICE_KC).toBe(19);
    expect(BOX_WEIGHT_GRAMS).toBe(126);
  });

  it("krabici jde přikoupit jen k balení 3 l mimo sirupy", () => {
    expect(isBoxEligible({ category: "polevky" }, { volumeMl: 3000 })).toBe(true);
    expect(isBoxEligible({ category: "caje" }, { volumeMl: 3000 })).toBe(true);
    expect(isBoxEligible({ category: "sirupy" }, { volumeMl: 3000 })).toBe(false);
    expect(isBoxEligible({ category: "sirupy" }, { volumeMl: 650 })).toBe(false);
    expect(isBoxEligible({ category: "koktejly" }, { volumeMl: 500 })).toBe(false);
    expect(isBoxEligible({ category: "polevky" }, { volumeMl: null })).toBe(false);
  });

  it("počet krabic = počet kusů způsobilých balení", () => {
    expect(
      boxCount([
        { quantity: 4, product: { category: "polevky" }, variant: { volumeMl: 3000 } },
        { quantity: 2, product: { category: "sirupy" }, variant: { volumeMl: 3000 } },
        { quantity: 1, product: { category: "caje" }, variant: { volumeMl: 3000 } },
      ])
    ).toBe(5);
  });

  it("počet krabic si zákazník volí: 0 až počet způsobilých balení", () => {
    expect(clampBoxes(2, 6)).toBe(2);
    expect(clampBoxes("2", 6)).toBe(2);
    expect(clampBoxes(9, 6)).toBe(6);
    expect(clampBoxes(0, 6)).toBe(0);
    expect(clampBoxes(-1, 6)).toBe(0);
    expect(clampBoxes("", 6)).toBe(0);
    expect(clampBoxes("abc", 6)).toBe(0);
    expect(clampBoxes(1.5, 6)).toBe(0);
    expect(clampBoxes(undefined, 6)).toBe(0);
  });

  it("hmotnost krabic jako řádek zásilky", () => {
    expect(boxWeightLines(0)).toEqual([]);
    expect(boxWeightLines(2)).toEqual([{ sku: BOX_SKU, name: BOX_NAME, quantity: 2, weightGrams: 126 }]);
  });
});

describe("cena objednávky s krabicí", () => {
  const cart = [
    { sku: "kulajda", quantity: 4 },
    { sku: "saman-3l", quantity: 1 },
    { sku: "svarak-500", quantity: 2 },
  ];

  it("bez volby se nic nemění", () => {
    const priced = priceCart(cart, "rozvoz", index, { shippingMode: "weight" });
    expect(priced.ok && priced.value).toMatchObject({
      packaging: null,
      weightGrams: 4 * 3000 + 3826 + 2 * 500,
      subtotalKc: 4 * 379 + 549 + 2 * 149,
    });
    if (priced.ok) expect(priced.value.totalKc).toBe(priced.value.subtotalKc + priced.value.shippingKc);
  });

  it("s volbou: 19 Kč a 126 g za každou polévku, sirup a malé balení beze změny", () => {
    const priced = priceCart(cart, "rozvoz", index, { shippingMode: "weight", boxes: 4 });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.value.packaging).toEqual({ sku: BOX_SKU, name: BOX_NAME, quantity: 4, unitPriceKc: 19, lineTotalKc: 76 });
    expect(priced.value.weightGrams).toBe(4 * 3000 + 4 * 126 + 3826 + 2 * 500);
    // zboží (základ pro slevové kódy) krabice neobsahuje
    expect(priced.value.subtotalKc).toBe(4 * 379 + 549 + 2 * 149);
    expect(priced.value.lines.map((line) => line.sku)).toEqual(["kulajda", "saman-3l", "svarak-500"]);
    expect(priced.value.totalKc).toBe(priced.value.subtotalKc + priced.value.shippingKc + 76);
  });

  it("krabice může posunout zásilku do vyššího pásma: 4 polévky + 4 čaje bez krabic 24 kg, 5 polévek 15 kg → s krabicí 15,63 kg", () => {
    const five = [{ sku: "kulajda", quantity: 5 }];
    const plain = priceCart(five, "rozvoz", index, { shippingMode: "weight" });
    const boxed = priceCart(five, "rozvoz", index, { shippingMode: "weight", boxes: 5 });
    expect(plain.ok && plain.value.shippingKc).toBe(379);
    expect(boxed.ok && boxed.value.shippingKc).toBe(379);
    const four = [{ sku: "kulajda", quantity: 4 }, { sku: "caj-3l", quantity: 1 }];
    const boxedFour = priceCart(four, "rozvoz", index, { shippingMode: "weight", boxes: 5 });
    expect(boxedFour.ok && boxedFour.value.weightGrams).toBe(5 * 3126);
  });

  it("jen část: 6 polévek, 2 krabice = 38 Kč a 252 g; víc než balení se ořízne", () => {
    const six = [{ sku: "kulajda", quantity: 6 }];
    const two = priceCart(six, "rozvoz", index, { shippingMode: "weight", boxes: 2 });
    expect(two.ok && two.value).toMatchObject({ weightGrams: 18_252, packaging: { quantity: 2, lineTotalKc: 38 } });
    const many = priceCart(six, "rozvoz", index, { shippingMode: "weight", boxes: 50 });
    expect(many.ok && many.value.packaging).toMatchObject({ quantity: 6, lineTotalKc: 114 });
  });

  it("jen sirupy: volba nic nepřidá", () => {
    const priced = priceCart([{ sku: "saman-3l", quantity: 3 }], "rozvoz", index, { shippingMode: "weight", boxes: 3 });
    expect(priced.ok && priced.value).toMatchObject({ packaging: null, weightGrams: 3 * 3826, shippingKc: 267 });
  });

  it("osobní odběr: krabice se účtuje, doprava zůstává zdarma", () => {
    const priced = priceCart([{ sku: "kulajda", quantity: 2 }], "osobni-odber", index, { shippingMode: "weight", boxes: 2 });
    expect(priced.ok && priced.value).toMatchObject({ shippingKc: 0, totalKc: 2 * 379 + 38 });
  });

  it("slevový kód a doprava zdarma krabici nezlevní", () => {
    const priced = priceCart([{ sku: "kulajda", quantity: 2 }], "rozvoz", index, { shippingMode: "weight", boxes: 2 });
    if (!priced.ok) throw new Error(priced.error);
    const discounted = withCoupons(priced.value, { applied: [], discountKc: 100, freeShipping: true });
    expect(discounted.totalKc).toBe(2 * 379 - 100 + 0 + 38);
  });
});

describe("uložení objednávky s krabicí", () => {
  const input: CheckoutInput = {
    cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "rozvoz",
    paymentMethodId: "prevod",
    billingStreet: "Prvního pluku 14",
    billingCity: "Praha",
    billingZip: "18600",
    billingCountry: "Česká republika",
    companyPurchase: false,
    billingCompany: "",
    billingIco: "",
    billingDic: "",
    deliverySameAsBilling: true,
    recipientName: "",
    recipientCompany: "",
    street: "",
    city: "",
    zip: "",
    recipientPhone: "",
    note: "",
    termsAccepted: true,
    ageConfirmed: false,
    boxes: "2",
  };

  it("krabice je řádek objednávky bez vazby na katalog a patří do mezisoučtu v databázi", () => {
    const checked = validateCheckoutInput(input, index, { shippingMode: "weight" });
    if (!checked.ok) throw new Error(checked.error);
    const orderId = "11111111-1111-4111-8111-111111111111";
    const built = buildEshopOrderRows(orderId, checked.value, new Map([["kulajda", { id: "v-kulajda", priceKc: 379 }]]), new Date());
    if (!built.ok) throw new Error(built.error);
    expect(built.rows.items).toEqual([
      { orderId, productVariantId: "v-kulajda", skuSnapshot: "kulajda", name: expect.any(String), quantity: 2, unitPriceKc: 379, lineTotalKc: 758 },
      { orderId, productVariantId: null, skuSnapshot: BOX_SKU, name: BOX_NAME, quantity: 2, unitPriceKc: 19, lineTotalKc: 38 },
    ]);
    const order = built.rows.order as { subtotalKc: number; discountKc: number; shippingKc: number; totalKc: number };
    expect(order.subtotalKc).toBe(758 + 38);
    expect(order.shippingKc).toBe(267);
    // CHECK orders_total_consistent
    expect(order.totalKc).toBe(order.subtotalKc - order.discountKc + order.shippingKc);
    // součet položek = mezisoučet (kontrola návrhu faktury)
    expect(built.rows.items.reduce((sum, item) => sum + item.lineTotalKc, 0)).toBe(order.subtotalKc);
  });

  it("bez zaškrtnutí zůstává objednávka jako dřív", () => {
    const checked = validateCheckoutInput({ ...input, boxes: "0" }, index, { shippingMode: "weight" });
    expect(checked.ok && checked.value.pricedCart.packaging).toBeNull();
  });

  it("„Objednat znovu“ krabici z dřívější objednávky tiše vynechá", () => {
    const reorder = reorderLines(
      [
        { name: "kulajda – 3 l", quantity: 2, unitPriceKc: 379, sku: "kulajda" },
        { name: BOX_NAME, quantity: 2, unitPriceKc: 19, sku: BOX_SKU },
      ],
      index
    );
    expect(reorder).toEqual({ lines: [{ sku: "kulajda", quantity: 2 }], skipped: [] });
  });
});
