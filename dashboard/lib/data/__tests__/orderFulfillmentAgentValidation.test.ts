// MCP objednávky 1.1 (plánování rozvozů) — čisté testy pravidel přechodu
// a vstupu update_order_fulfillment. Datová vrstva (atomičnost, souběh,
// oprávnění) je ověřená v __tests__/mcpOrderFulfillment.integration.test.ts.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FULFILLMENT_TRANSITIONS,
  isAllowedFulfillmentTransition,
  isTerminalFulfillmentStatus,
  validateUpdateOrderFulfillmentInput,
  type UpdateOrderFulfillmentInput,
} from "../orderFulfillmentAgentValidation";
import { FULFILLMENT_STATUSES } from "../orderValidation";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-06T12:00:00Z");

const base: UpdateOrderFulfillmentInput = {
  orderId: ORDER_ID,
  targetStatus: "handed_to_carrier",
  eventAt: null,
  carrier: null,
  trackingNumber: null,
  note: null,
};

describe("ALLOWED_FULFILLMENT_TRANSITIONS", () => {
  it("pokrývá každý stav a nikdy nepovolí přechod na sebe sama", () => {
    for (const status of FULFILLMENT_STATUSES) {
      expect(ALLOWED_FULFILLMENT_TRANSITIONS[status]).toBeDefined();
      expect(ALLOWED_FULFILLMENT_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it("cancelled je koncový stav (žádné další přechody); delivered NENÍ přísně koncový — smí se opravit zpět na poslední krok rozvozu", () => {
    expect(isTerminalFulfillmentStatus("cancelled")).toBe(true);
    expect(isTerminalFulfillmentStatus("delivered")).toBe(false);
    expect(isTerminalFulfillmentStatus("ready")).toBe(false);
  });

  it("delivered → handed_to_carrier/out_for_delivery povoleno (oprava předčasně označeného doručení), ale NE dál zpátky (ne na ready)", () => {
    expect(isAllowedFulfillmentTransition("delivered", "handed_to_carrier")).toBe(true);
    expect(isAllowedFulfillmentTransition("delivered", "out_for_delivery")).toBe(true);
    expect(isAllowedFulfillmentTransition("delivered", "ready")).toBe(false);
    expect(isAllowedFulfillmentTransition("delivered", "new")).toBe(false);
  });

  it("ready → handed_to_carrier i out_for_delivery povoleno; handed_to_carrier → delivered povoleno", () => {
    expect(isAllowedFulfillmentTransition("ready", "handed_to_carrier")).toBe(true);
    expect(isAllowedFulfillmentTransition("ready", "out_for_delivery")).toBe(true);
    expect(isAllowedFulfillmentTransition("handed_to_carrier", "delivered")).toBe(true);
    expect(isAllowedFulfillmentTransition("out_for_delivery", "delivered")).toBe(true);
  });

  it("zakazuje přeskočení kroku (new → delivered) i couvnutí (delivered → ready)", () => {
    expect(isAllowedFulfillmentTransition("new", "delivered")).toBe(false);
    expect(isAllowedFulfillmentTransition("delivered", "ready")).toBe(false);
    expect(isAllowedFulfillmentTransition("ready", "new")).toBe(false);
  });

  it("cancelled jde nastavit z každého nedokončeného stavu, ale ne z delivered/cancelled", () => {
    for (const status of FULFILLMENT_STATUSES) {
      if (status === "delivered" || status === "cancelled") {
        expect(isAllowedFulfillmentTransition(status, "cancelled")).toBe(false);
      } else {
        expect(isAllowedFulfillmentTransition(status, "cancelled")).toBe(true);
      }
    }
  });
});

describe("validateUpdateOrderFulfillmentInput", () => {
  it("platný vstup projde a ořízne prázdné/whitespace hodnoty na null", () => {
    const result = validateUpdateOrderFulfillmentInput({ ...base, carrier: "  CoolBalík  ", trackingNumber: "ABC123", note: "   " }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.carrier).toBe("CoolBalík");
      expect(result.value.trackingNumber).toBe("ABC123");
      expect(result.value.note).toBeNull();
      expect(result.value.eventAt).toBeNull();
    }
  });

  it("neznámý cílový stav je odmítnut", () => {
    const result = validateUpdateOrderFulfillmentInput({ ...base, targetStatus: "shipped" as never }, NOW);
    expect(result.ok).toBe(false);
  });

  it("event_at v budoucnosti (přes toleranci) je odmítnut — čas události není plán", () => {
    const result = validateUpdateOrderFulfillmentInput({ ...base, eventAt: "2026-11-07T12:00:00Z" }, NOW);
    expect(result.ok).toBe(false);
  });

  it("event_at pár minut v budoucnu (tolerance psaní zprávy) projde", () => {
    const result = validateUpdateOrderFulfillmentInput({ ...base, eventAt: "2026-11-06T12:05:00Z" }, NOW);
    expect(result.ok).toBe(true);
  });

  it("neplatné event_at je odmítnuto", () => {
    const result = validateUpdateOrderFulfillmentInput({ ...base, eventAt: "včera večer" }, NOW);
    expect(result.ok).toBe(false);
  });

  it("příliš dlouhá poznámka je odmítnuta", () => {
    const result = validateUpdateOrderFulfillmentInput({ ...base, note: "x".repeat(2001) }, NOW);
    expect(result.ok).toBe(false);
  });
});
