import { describe, expect, it } from "vitest";
import { invoiceSentState } from "../invoiceSentState";

const base = { invoiceSentMethod: null, fulfillmentStatus: "delivered" };
describe("Faktura poslána bez ručního zaškrtávání (22. 11. 2026)", () => {
  it("odeslaná faktura = hotovo", () => {
    expect(invoiceSentState({ ...base, invoiceSentAt: new Date(), orderedAt: new Date("2026-11-21"), shipped: true })).toEqual({ done: true, legacy: false });
  });
  it("starší doručená objednávka = poslaná mimo systém", () => {
    expect(invoiceSentState({ ...base, invoiceSentAt: null, orderedAt: new Date("2026-11-10"), shipped: true })).toEqual({ done: true, legacy: true });
  });
  it("neodeslaná nová objednávka čeká na Odesláno", () => {
    expect(invoiceSentState({ ...base, fulfillmentStatus: "ready", invoiceSentAt: null, orderedAt: new Date("2026-11-21"), shipped: false })).toEqual({ done: false, reason: "waits_for_shipping" });
  });
  it("odeslaná bez faktury = upozornění", () => {
    expect(invoiceSentState({ ...base, invoiceSentAt: null, orderedAt: new Date("2026-11-21"), shipped: true })).toEqual({ done: false, reason: "not_sent_after_shipping" });
  });
});
