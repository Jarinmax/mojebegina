import { describe, expect, it } from "vitest";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { catalogIndex } from "./helpers/catalogFixture";
import { paymentMethodsFor, slovakPayer, SLOVAKIA_CARD_ONLY_NOTE } from "../shipping";

function input(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
    name: "Ján Novák",
    email: "jan@example.sk",
    phone: "+421 905 123 456",
    shippingMethodId: "rozvoz",
    paymentMethodId: "prevod",
    billingStreet: "Obchodná 12",
    billingCity: "Bratislava",
    billingZip: "81106",
    billingCountry: "Slovensko",
    companyPurchase: false,
    billingCompany: "",
    billingIco: "",
    billingDic: "",
    deliverySameAsBilling: true,
    recipientName: "",
    recipientCompany: "",
    recipientPhone: "",
    street: "",
    city: "",
    zip: "",
    note: "",
    termsAccepted: true,
    ageConfirmed: false,
    ...overrides,
  };
}

describe("Slovensko — platba jen kartou", () => {
  it("pozná slovenského plátce podle fakturační země nebo doručení na Slovensko", () => {
    expect(slovakPayer({ billingCountry: "Slovensko", destination: "cz" })).toBe(true);
    expect(slovakPayer({ billingCountry: "Česká republika", destination: "sk" })).toBe(true);
    expect(slovakPayer({ billingCountry: "Česká republika", destination: "cz" })).toBe(false);
  });

  it("Slovákovi nabídne jen kartu, Čechovi převod i kartu", () => {
    expect(paymentMethodsFor(true, { slovakPayer: true }).map((m) => m.id)).toEqual(["karta"]);
    expect(paymentMethodsFor(true).map((m) => m.id)).toEqual(["prevod", "karta"]);
  });

  it("server odmítne převod na Slovensko", () => {
    const result = validateCheckoutInput(input(), catalogIndex, { cardPaymentAvailable: true, slovakia: true });
    expect(result).toEqual({ ok: false, error: `${SLOVAKIA_CARD_ONLY_NOTE} Zvolte prosím platbu kartou.` });
  });

  it("odmítne převod i u slovenské fakturační adresy s doručením do Česka", () => {
    const result = validateCheckoutInput(
      input({ deliverySameAsBilling: false, recipientName: "Ján Novák", recipientPhone: "+420 777 123 456", street: "Prvního pluku 14", city: "Praha", zip: "18600" }),
      catalogIndex,
      { cardPaymentAvailable: true, slovakia: true }
    );
    expect(result.ok).toBe(false);
  });

  it("bez dostupné karty řekne, ať pošle objednávku e-mailem", () => {
    const result = validateCheckoutInput(input({ paymentMethodId: "karta" }), catalogIndex, { cardPaymentAvailable: false, slovakia: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("e-mailem");
  });

  it("platbu kartou na Slovensko nezablokuje", () => {
    const result = validateCheckoutInput(input({ paymentMethodId: "karta" }), catalogIndex, { cardPaymentAvailable: true, slovakia: true });
    if (!result.ok) expect(result.error).not.toContain(SLOVAKIA_CARD_ONLY_NOTE);
  });
});
