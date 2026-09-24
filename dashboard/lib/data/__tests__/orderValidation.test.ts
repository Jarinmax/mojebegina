import { describe, expect, it } from "vitest";
import {
  validateCreateOrderInput,
  validateFulfillmentStatusInput,
  validatePaymentStatusInput,
  validateNoteInput,
  isPaymentOverdue,
  type CreateOrderInput,
} from "../orderValidation";

function baseInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    buyerOrganizationId: "org-1",
    contactName: "Jana Nováková",
    contactPhone: "",
    contactEmail: "",
    plannedDeliveryAt: "",
    note: "",
    shippingKc: "",
    items: [{ name: "Dýňová polévka", quantity: "2", unitPriceKc: "379" }],
    ...overrides,
  };
}

describe("validateCreateOrderInput — Security Phase 15", () => {
  it("platný vstup projde, ořízne mezery a dopočítá součty", () => {
    const result = validateCreateOrderInput(
      baseInput({ contactName: "  Jana Nováková  ", shippingKc: "50" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contactName).toBe("Jana Nováková");
      expect(result.value.items).toEqual([
        { name: "Dýňová polévka", quantity: 2, unitPriceKc: 379, lineTotalKc: 758 },
      ]);
      expect(result.value.subtotalKc).toBe(758);
      expect(result.value.shippingKc).toBe(50);
      expect(result.value.totalKc).toBe(808);
    }
  });

  it("prázdné nepovinné kontaktní údaje se uloží jako null", () => {
    const result = validateCreateOrderInput(baseInput({ contactName: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contactName).toBeNull();
      expect(result.value.contactPhone).toBeNull();
      expect(result.value.contactEmail).toBeNull();
    }
  });

  it("chybějící organizace = DENY", () => {
    expect(validateCreateOrderInput(baseInput({ buyerOrganizationId: "  " }))).toEqual({
      ok: false,
      error: "Vyberte zákaznickou organizaci.",
    });
  });

  it("žádná položka = DENY", () => {
    expect(validateCreateOrderInput(baseInput({ items: [] }))).toEqual({
      ok: false,
      error: "Přidejte alespoň jednu položku.",
    });
  });

  it("položka s prázdným názvem = DENY", () => {
    const result = validateCreateOrderInput(
      baseInput({ items: [{ name: "  ", quantity: "1", unitPriceKc: "10" }] })
    );
    expect(result).toEqual({ ok: false, error: "Zadejte název u každé položky." });
  });

  it("nekladné množství = DENY", () => {
    const result = validateCreateOrderInput(
      baseInput({ items: [{ name: "Polévka", quantity: "0", unitPriceKc: "10" }] })
    );
    expect(result.ok).toBe(false);
  });

  it("neplatné (nečíselné) množství = DENY", () => {
    const result = validateCreateOrderInput(
      baseInput({ items: [{ name: "Polévka", quantity: "abc", unitPriceKc: "10" }] })
    );
    expect(result.ok).toBe(false);
  });

  it("záporná cena = DENY", () => {
    const result = validateCreateOrderInput(
      baseInput({ items: [{ name: "Polévka", quantity: "1", unitPriceKc: "-5" }] })
    );
    expect(result.ok).toBe(false);
  });

  it("neplatné plánované datum doručení = DENY", () => {
    const result = validateCreateOrderInput(baseInput({ plannedDeliveryAt: "zítra" }));
    expect(result).toEqual({ ok: false, error: "Neplatné plánované datum doručení." });
  });

  it("platné plánované datum doručení se naparsuje na poledne UTC", () => {
    const result = validateCreateOrderInput(baseInput({ plannedDeliveryAt: "2026-10-01" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plannedDeliveryAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    }
  });

  it("neplatná doprava (záporná/nečíselná) = DENY", () => {
    expect(validateCreateOrderInput(baseInput({ shippingKc: "-1" })).ok).toBe(false);
    expect(validateCreateOrderInput(baseInput({ shippingKc: "abc" })).ok).toBe(false);
  });
});

describe("validateFulfillmentStatusInput — Security Phase 15", () => {
  it("platný stav projde", () => {
    expect(validateFulfillmentStatusInput("preparing")).toEqual({ ok: true, value: "preparing" });
  });

  it("neplatný stav = DENY", () => {
    expect(validateFulfillmentStatusInput("shipped").ok).toBe(false);
  });
});

describe("validatePaymentStatusInput — Security Phase 15", () => {
  it("platný stav projde", () => {
    expect(validatePaymentStatusInput("invoiced")).toEqual({ ok: true, value: "invoiced" });
  });

  it("neplatný stav = DENY (cancelled patří do fulfillment, ne payment)", () => {
    expect(validatePaymentStatusInput("cancelled").ok).toBe(false);
  });
});

describe("validateNoteInput — Security Phase 15", () => {
  it("platná poznámka projde a ořízne mezery", () => {
    expect(validateNoteInput({ body: "  Doručit do 14h.  " })).toEqual({
      ok: true,
      value: "Doručit do 14h.",
    });
  });

  it("prázdná poznámka je povolená (maže existující)", () => {
    expect(validateNoteInput({ body: "   " })).toEqual({ ok: true, value: "" });
  });

  it("příliš dlouhá poznámka = DENY", () => {
    expect(validateNoteInput({ body: "a".repeat(2001) }).ok).toBe(false);
  });
});

describe("isPaymentOverdue — Security Phase 15", () => {
  it("invoiced + due_at v minulosti = po splatnosti", () => {
    expect(isPaymentOverdue("invoiced", new Date("2020-01-01"))).toBe(true);
  });

  it("invoiced + due_at v budoucnosti = není po splatnosti", () => {
    expect(isPaymentOverdue("invoiced", new Date("2099-01-01"))).toBe(false);
  });

  it("invoiced bez due_at = není po splatnosti (nelze spočítat)", () => {
    expect(isPaymentOverdue("invoiced", null)).toBe(false);
  });

  it("paid se nikdy nepočítá jako po splatnosti, i s due_at v minulosti", () => {
    expect(isPaymentOverdue("paid", new Date("2020-01-01"))).toBe(false);
  });

  it("unpaid se nepočítá jako po splatnosti (ještě nebylo fakturováno)", () => {
    expect(isPaymentOverdue("unpaid", new Date("2020-01-01"))).toBe(false);
  });
});
