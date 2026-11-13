// Zásilkovna v pokladně (13. 11. 2026): jen kapsičky sirupu, výdejní místo
// z mapy, cena 104 Kč včetně krabice; vypnutá, dokud není ESHOP_ZASILKOVNA=on.
import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "../catalogIndex";
import { priceCart } from "../pricing";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { buildEshopOrderRows } from "../orderWrite";
import { shippingMethodsFor, zasilkovnaEnabledFromEnv, quoteShipping } from "../shipping";
import { shippingPageFor } from "../infoPages";
import { pointFromWidget } from "../zasilkovna";
import { deliveryBlock } from "../orderParties";
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
const product = (slug: string, category: string, variants: Variant[]): Product => ({
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
  isAgeRestricted: false,
  foodInfo: { ingredients: null, allergens: [], nutritionPer100g: null, storage: null, shelfLife: null },
});
const catalog: Catalog = {
  categories: ["polevky", "sirupy"].map((slug) => ({ slug, name: slug, image: null, intro: [], detailSections: [], ageRestricted: false })),
  products: [
    product("kulajda", "polevky", [variant("kulajda", 379, 3000, 3000)]),
    product("lipovy", "sirupy", [variant("lipovy-3l", 549, 3000, 3826), variant("lipovy-650", 199, 650, 805)]),
    product("saman", "sirupy", [variant("saman-650", 199, 650, 805)]),
  ],
};
const index = createCatalogIndex(catalog);
const on = { shippingMode: "weight" as const, zasilkovna: true };

describe("Zásilkovna — zapnutí a nabídka", () => {
  it("výchozí stav je vypnuto; zapíná jen ESHOP_ZASILKOVNA=on", () => {
    expect(zasilkovnaEnabledFromEnv({})).toBe(false);
    expect(zasilkovnaEnabledFromEnv({ ESHOP_ZASILKOVNA: "1" })).toBe(false);
    expect(zasilkovnaEnabledFromEnv({ ESHOP_ZASILKOVNA: "on" })).toBe(true);
    expect(shippingMethodsFor("weight").map((m) => m.id)).toEqual(["rozvoz", "osobni-odber"]);
    expect(shippingMethodsFor("weight", { zasilkovna: true }).map((m) => m.id)).toEqual(["rozvoz", "osobni-odber", "zasilkovna"]);
  });

  it("vypnutou Zásilkovnu server odmítne i u podvrženého formuláře", () => {
    const priced = priceCart([{ sku: "lipovy-650", quantity: 1 }], "zasilkovna", index, { shippingMode: "weight" });
    expect(priced).toEqual({ ok: false, error: "Vyberte způsob doručení." });
  });

  it("stránka Doprava ji uvádí jen zapnutou, s cenou 104 Kč", () => {
    const items = (page: ReturnType<typeof shippingPageFor>) => page.blocks.flatMap((b) => b.items ?? []).join("\n");
    expect(items(shippingPageFor("weight"))).not.toContain("Zásilkovna");
    expect(items(shippingPageFor("weight", { zasilkovna: true }))).toMatch(/Zásilkovna – výdejní místo nebo Z-BOX — 104\sKč/);
  });
});

describe("Zásilkovna — cena v košíku", () => {
  it("1–4 kapsičky: doprava 104 Kč, chlazená by stála 267 Kč", () => {
    const one = priceCart([{ sku: "lipovy-650", quantity: 1 }], "zasilkovna", index, on);
    expect(one.ok && one.value).toMatchObject({ shippingKc: 104, weightGrams: 878, subtotalKc: 199, totalKc: 303, packaging: null });
    const four = priceCart([{ sku: "lipovy-650", quantity: 2 }, { sku: "saman-650", quantity: 2 }], "zasilkovna", index, on);
    expect(four.ok && four.value).toMatchObject({ shippingKc: 104, weightGrams: 3293, totalKc: 4 * 199 + 104 });
    const cold = priceCart([{ sku: "lipovy-650", quantity: 1 }], "rozvoz", index, on);
    expect(cold.ok && cold.value.shippingKc).toBe(267);
  });

  it("5 kapsiček, sirup 3 l nebo polévka v košíku: Zásilkovnu server odmítne", () => {
    const five = priceCart([{ sku: "lipovy-650", quantity: 5 }], "zasilkovna", index, on);
    expect(five.ok).toBe(false);
    if (!five.ok) expect(five.error).toContain("nejvýše 4 ks");
    for (const sku of ["lipovy-3l", "kulajda"]) {
      const mixed = priceCart([{ sku: "lipovy-650", quantity: 1 }, { sku, quantity: 1 }], "zasilkovna", index, on);
      expect(mixed.ok).toBe(false);
      if (!mixed.ok) expect(mixed.error).toContain("jen sirupy v kapsičce 650 ml");
    }
  });

  it("volitelné krabice za 19 Kč se u Zásilkovny nepočítají (krabice je v ceně)", () => {
    const priced = priceCart([{ sku: "lipovy-650", quantity: 2 }], "zasilkovna", index, { ...on, boxes: 2 });
    expect(priced.ok && priced.value).toMatchObject({ packaging: null, shippingKc: 104 });
  });

  it("obecný výpočet dopravy Zásilkovnu nikdy neocení sám", () => {
    const method = shippingMethodsFor("weight", { zasilkovna: true })[2];
    expect(quoteShipping(method, [], "weight", { email: "a@b.cz", phone: "1" }).available).toBe(false);
  });
});

describe("Zásilkovna — výdejní místo", () => {
  it("odpověď mapy → výdejní místo; zavřené okno, cizina nebo chybějící ID = nic", () => {
    expect(pointFromWidget({ id: 1234, name: "Z-BOX Kolín, Benešova 12", street: "Benešova 12", city: "Kolín", zip: "280 02", country: "cz" })).toEqual({
      id: "1234",
      name: "Z-BOX Kolín, Benešova 12",
      street: "Benešova 12",
      city: "Kolín",
      zip: "280 02",
    });
    expect(pointFromWidget(null)).toBeNull();
    expect(pointFromWidget({ id: 5, name: "X", city: "Bratislava", zip: "811 01", country: "sk" })).toBeNull();
    expect(pointFromWidget({ name: "X", city: "Kolín", zip: "280 02", country: "cz" })).toBeNull();
    expect(pointFromWidget({ id: "abc", name: "X", city: "Kolín", zip: "280 02" })).toBeNull();
  });

  const input: CheckoutInput = {
    cart: JSON.stringify([{ sku: "lipovy-650", quantity: 1 }]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "zasilkovna",
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
    pickupPointId: "1234",
    pickupPointName: "Z-BOX Kolín, Benešova 12",
    pickupPointStreet: "Benešova 12",
    pickupPointCity: "Kolín",
    pickupPointZip: "28002",
  };

  it("bez vybraného místa objednávka neprojde", () => {
    const missing = validateCheckoutInput({ ...input, pickupPointId: "" }, index, on);
    expect(missing).toEqual({ ok: false, error: "Vyberte prosím výdejní místo nebo Z-BOX Zásilkovny." });
    const forged = validateCheckoutInput({ ...input, pickupPointId: "12; DROP" }, index, on);
    expect(forged.ok).toBe(false);
  });

  it("slovenské výdejní místo neprojde", () => {
    const sk = validateCheckoutInput({ ...input, pickupPointCity: "Bratislava", pickupPointZip: "811 01" }, index, on);
    expect(sk.ok).toBe(false);
    if (!sk.ok) expect(sk.error).toContain("jen na výdejní místa v České republice");
  });

  it("objednávka: doručovací adresa = výdejní místo, ID místa je vidět, cena 104 Kč", () => {
    const checked = validateCheckoutInput(input, index, on);
    if (!checked.ok) throw new Error(checked.error);
    expect(checked.value.pickupPoint).toEqual({ id: "1234", name: "Z-BOX Kolín, Benešova 12" });
    expect(checked.value.delivery).toEqual({
      sameAsBilling: false,
      name: "Jana Nováková",
      company: "Zásilkovna: Z-BOX Kolín, Benešova 12 (ID 1234)",
      street: "Benešova 12",
      city: "Kolín",
      zip: "280 02",
      country: "Česká republika",
      phone: "+420 777 123 456",
    });
    const orderId = "11111111-1111-4111-8111-111111111111";
    const built = buildEshopOrderRows(orderId, checked.value, new Map([["lipovy-650", { id: "v1", priceKc: 199 }]]), new Date());
    if (!built.ok) throw new Error(built.error);
    const order = built.rows.order as Record<string, unknown>;
    expect(order).toMatchObject({
      shippingMethodCode: "zasilkovna",
      shippingMethodLabel: "Zásilkovna – výdejní místo nebo Z-BOX",
      shippingKc: 104,
      subtotalKc: 199,
      totalKc: 303,
      recipientName: "Jana Nováková",
      recipientCompany: "Zásilkovna: Z-BOX Kolín, Benešova 12 (ID 1234)",
      recipientAddress: "Benešova 12, 280 02 Kolín",
      recipientPhone: "+420 777 123 456",
    });
    // blok „Doručení“ v e-mailech a v detailu objednávky ukáže výdejní místo
    const block = deliveryBlock({
      contactName: "Jana Nováková",
      contactEmail: "jana@example.cz",
      contactPhone: "+420 777 123 456",
      recipientName: order.recipientName as string,
      recipientCompany: order.recipientCompany as string,
      recipientAddress: order.recipientAddress as string,
      recipientPhone: order.recipientPhone as string,
      shippingMethodCode: "zasilkovna",
      shippingMethodLabel: order.shippingMethodLabel as string,
      deliverySameAsBilling: false,
    });
    expect(block.lines.join(" | ")).toContain("Zásilkovna: Z-BOX Kolín, Benešova 12 (ID 1234)");
    expect(block.lines.join(" | ")).toContain("Benešova 12");
  });
});
