import { describe, expect, it, vi } from "vitest";
import { PENDING_ORDER_MAX_AGE_MS, parsePendingOrder, serializePendingOrder } from "../pendingOrder";
import { pendingOrderState, type PaymentOrder } from "../stripe/payment";

vi.mock("server-only", () => ({}));

const ID = "8dc67f29-456c-4a1b-9c2d-0e1f2a3b4c5d";
const NOW = Date.UTC(2026, 9, 14, 8, 0, 0);

describe("rozpracovaná objednávka v prohlížeči", () => {
  it("uložený záznam se přečte zpět (id, číslo, čas)", () => {
    const raw = serializePendingOrder({ orderId: ID, orderNumber: 70000005, savedAt: NOW });
    expect(parsePendingOrder(raw, NOW + 60_000)).toEqual({ orderId: ID, orderNumber: 70000005, savedAt: NOW });
    expect(parsePendingOrder(serializePendingOrder({ orderId: ID, orderNumber: null, savedAt: NOW }), NOW)).toMatchObject({
      orderNumber: null,
    });
  });

  it("poškozený, cizí nebo podvržený záznam = žádná rozpracovaná objednávka", () => {
    for (const raw of [
      null,
      "",
      "{",
      "[]",
      "null",
      JSON.stringify({ orderId: "../admin", orderNumber: 1, savedAt: NOW }),
      JSON.stringify({ orderId: ID.toUpperCase(), orderNumber: 1, savedAt: NOW }),
      JSON.stringify({ orderId: ID, orderNumber: "70000005", savedAt: NOW }),
      JSON.stringify({ orderId: ID, orderNumber: -1, savedAt: NOW }),
      JSON.stringify({ orderId: ID, orderNumber: 1 }),
    ]) {
      expect(parsePendingOrder(raw, NOW), String(raw)).toBeNull();
    }
  });

  it("po týdnu se zapomene; čas z budoucnosti se nepřijme", () => {
    const raw = (savedAt: number) => serializePendingOrder({ orderId: ID, orderNumber: 1, savedAt });
    expect(parsePendingOrder(raw(NOW - PENDING_ORDER_MAX_AGE_MS + 1000), NOW)).not.toBeNull();
    expect(parsePendingOrder(raw(NOW - PENDING_ORDER_MAX_AGE_MS - 1000), NOW)).toBeNull();
    expect(parsePendingOrder(raw(NOW + 10 * 60_000), NOW)).toBeNull();
  });
});

describe("stav rozpracované objednávky (server)", () => {
  const order = (overrides: Partial<PaymentOrder> = {}): PaymentOrder => ({
    id: ID,
    orderNumber: 70000005,
    paymentVs: "70000005",
    orderedAt: new Date(NOW),
    channel: "eshop",
    paymentMethodCode: "karta",
    paymentStatus: "unpaid",
    fulfillmentStatus: "new",
    contactEmail: "jana@example.cz",
    subtotalKc: 379,
    discountKc: 0,
    shippingKc: 0,
    totalKc: 379,
    shippingMethodLabel: null,
    items: [],
    ...overrides,
  });

  it("nezaplacená objednávka kartou → nabídnout „Zaplatit objednávku“ s původním číslem", () => {
    expect(pendingOrderState(order(), true)).toEqual({ state: "payable", orderNumber: 70000005 });
  });

  it("zaplacená → zapomenout (žádná druhá platba)", () => {
    expect(pendingOrderState(order({ paymentStatus: "paid" }), true)).toEqual({ state: "paid", orderNumber: 70000005 });
  });

  it("zrušená, převodem, cizí kanál, neexistující nebo karta vypnutá → zapomenout", () => {
    expect(pendingOrderState(order({ fulfillmentStatus: "cancelled" }), true).state).toBe("closed");
    expect(pendingOrderState(order({ paymentMethodCode: "prevod" }), true).state).toBe("closed");
    expect(pendingOrderState(order({ channel: "b2b" }), true).state).toBe("closed");
    expect(pendingOrderState(null, true)).toEqual({ state: "closed", orderNumber: null });
    expect(pendingOrderState(order(), false).state).toBe("closed");
  });
});

describe("napodobenina Stripe jen pro místní test v prohlížeči", async () => {
  const { stripeApiOverride } = await import("../stripe/client");
  it("místní adresa + testovací klíč mimo Vercel → přesměrování", () => {
    expect(stripeApiOverride("sk_test_x", { E2E_STRIPE_API: "http://127.0.0.1:12111" })).toEqual({
      host: "127.0.0.1",
      port: 12111,
      protocol: "http",
    });
  });
  it("na Vercelu, s ostrým klíčem, bez proměnné nebo s cizí adresou → skutečný Stripe", () => {
    expect(stripeApiOverride("sk_test_x", { E2E_STRIPE_API: "http://127.0.0.1:12111", VERCEL: "1" })).toEqual({});
    expect(stripeApiOverride("sk_live_x", { E2E_STRIPE_API: "http://127.0.0.1:12111" })).toEqual({});
    expect(stripeApiOverride("sk_test_x", {})).toEqual({});
    expect(stripeApiOverride("sk_test_x", { E2E_STRIPE_API: "http://evil.example:80" })).toEqual({});
  });
});
