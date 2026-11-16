import { describe, expect, it } from "vitest";
import { quoteShipping, shippingDestination, shippingMethodsFor, slovakiaEnabledFromEnv } from "../shipping";

const contact = { email: "info@begina.cz", phone: "+420 774 199 975" };
const cold = shippingMethodsFor("weight", { zasilkovna: false }).find((method) => method.id === "rozvoz")!;
const sirupy = [{ sku: "a", name: "Lipový sirup 3 l", quantity: 5, weightGrams: 3826 }];

describe("doručení na Slovensko", () => {
  it("je vypnuté, dokud není ESHOP_SLOVAKIA=on", () => {
    expect(slovakiaEnabledFromEnv({})).toBe(false);
    expect(slovakiaEnabledFromEnv({ ESHOP_SLOVAKIA: "on" })).toBe(true);
    expect(shippingDestination({ enabled: false, sameAsBilling: false, billingCountry: "Slovensko", zip: "821 05" })).toBe("cz");
  });
  it("cíl určí země fakturace nebo slovenské PSČ", () => {
    expect(shippingDestination({ enabled: true, sameAsBilling: true, billingCountry: "Slovensko", zip: "" })).toBe("sk");
    expect(shippingDestination({ enabled: true, sameAsBilling: true, billingCountry: "Česká republika", zip: "821 05" })).toBe("cz");
    expect(shippingDestination({ enabled: true, sameAsBilling: false, billingCountry: "Česká republika", zip: "82105" })).toBe("sk");
    expect(shippingDestination({ enabled: true, sameAsBilling: false, billingCountry: "Slovensko", zip: "110 00" })).toBe("cz");
  });
  it("počítá slovenským ceníkem (5 × 3 l sirup = 19,13 kg)", () => {
    expect(quoteShipping(cold, sirupy, "weight", contact, "sk")).toMatchObject({ available: true, priceKc: 421, weightGrams: 19130 });
    expect(quoteShipping(cold, sirupy, "weight", contact)).toMatchObject({ available: true, priceKc: 379 });
  });
});
