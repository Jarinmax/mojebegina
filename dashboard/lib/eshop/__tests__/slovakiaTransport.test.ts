import { describe, expect, it } from "vitest";
import { isSlovakAddress, SLOVAKIA_SELF_TRANSPORT_METHOD_NOTE, SLOVAKIA_SELF_TRANSPORT_PRICE_LABEL } from "../shipping";
import { emailsFor } from "../email/orderEmails";
import { customerSkTransportEmail, type EmailOrder } from "../email/templates";

const base = {
  channel: "eshop",
  paymentMethodCode: "karta",
  paymentStatus: "paid",
  externalWooCommerceId: null,
  shippingMethodCode: "rozvoz",
  shippingKc: 0,
};

describe("Slovensko – vlastní CoolBalík zákazníka", () => {
  it("pozná slovenské PSČ v adrese", () => {
    expect(isSlovakAddress("Starkova 1212/1, 010 01 Zilina")).toBe(true);
    expect(isSlovakAddress("Hlavná 5, 811 01 Bratislava")).toBe(true);
    expect(isSlovakAddress("Vitice 119, 281 06 Vitice")).toBe(false);
    expect(isSlovakAddress(null)).toBe(false);
  });

  it("pokladna neukazuje Zdarma", () => {
    expect(SLOVAKIA_SELF_TRANSPORT_PRICE_LABEL).not.toMatch(/zdarma/i);
    expect(SLOVAKIA_SELF_TRANSPORT_METHOD_NOTE).toContain("Doprava není v ceně");
    expect(SLOVAKIA_SELF_TRANSPORT_METHOD_NOTE).not.toMatch(/uspornybalik|PPL|DPD/);
  });

  it("e-mail po přípravě jde jen zaplacené slovenské objednávce", () => {
    const sk = { ...base, recipientAddress: "Starkova 1212/1, 010 01 Zilina" };
    expect(emailsFor(sk, "order_ready")).toEqual(["customer_sk_transport"]);
    expect(emailsFor({ ...sk, paymentStatus: "pending" }, "order_ready")).toEqual([]);
    expect(emailsFor({ ...sk, recipientAddress: "Vitice 119, 281 06 Vitice" }, "order_ready")).toEqual([]);
    expect(emailsFor({ ...sk, shippingMethodCode: "osobni-odber" }, "order_ready")).toEqual([]);
  });

  it("text e-mailu: CoolBalík, Vitice, hmotnost, doprava není zdarma", () => {
    const order: EmailOrder = {
      id: "00000000-0000-0000-0000-000000000001",
      orderNumber: 70000099,
      paymentVs: null,
      contactName: "Ján Novák",
      contactEmail: "jan@example.sk",
      recipientAddress: "Starkova 1212/1, 010 01 Zilina",
      shippingMethodCode: "rozvoz",
      shippingMethodLabel: "Chlazená přeprava",
      paymentMethodCode: "karta",
      paymentMethodLabel: "Kartou",
      paymentStatus: "paid",
      orderedAt: new Date("2026-11-22T10:00:00Z"),
      subtotalKc: 1497,
      discountKc: 0,
      shippingKc: 0,
      totalKc: 1497,
      customerNote: null,
      items: [{ name: "Dýňová polévka – 3 l", quantity: 3, unitPriceKc: 499, lineTotalKc: 1497 }],
    };
    const mail = customerSkTransportEmail(order, { baseUrl: "https://begina.cz", withheld: [], test: false, skTransport: { grams: 8850 } });
    expect(mail.subject).toContain("70000099");
    expect(mail.text).toContain("CoolBalík");
    expect(mail.text).toContain("Vitice 119, 281 06 Vitice");
    expect(mail.text).toContain("cca 9 kg");
    expect(mail.text).toContain("platíte dopravci zvlášť");
    expect(mail.text).not.toMatch(/: zdarma/);
    expect(mail.text).not.toMatch(/uspornybalik/);
  });
});
