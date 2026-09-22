import { describe, expect, it } from "vitest";
import {
  validateCreateNodeInput,
  validateTreeDepth,
  validateStatusInput,
  validatePriorityInput,
  validateCommentInput,
  validateClaimInput,
} from "../companyNodeValidation";

describe("validateCreateNodeInput — Security Phase 12", () => {
  it("platný vstup projde a ořízne mezery", () => {
    const result = validateCreateNodeInput({
      title: "  Bistro  ",
      description: "  Provoz bistra  ",
      priority: "medium",
    });
    expect(result).toEqual({
      ok: true,
      value: { title: "Bistro", description: "Provoz bistra", priority: "medium" },
    });
  });

  it("prázdný popis se uloží jako null", () => {
    const result = validateCreateNodeInput({ title: "Bistro", description: "   ", priority: "low" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBeNull();
    }
  });

  it("prázdný název = DENY", () => {
    expect(validateCreateNodeInput({ title: "  ", description: "", priority: "low" })).toEqual({
      ok: false,
      error: "Zadejte název.",
    });
  });

  it("příliš dlouhý název = DENY", () => {
    const result = validateCreateNodeInput({
      title: "a".repeat(201),
      description: "",
      priority: "low",
    });
    expect(result.ok).toBe(false);
  });

  it("neplatná priorita = DENY", () => {
    const result = validateCreateNodeInput({ title: "Bistro", description: "", priority: "urgent" });
    expect(result).toEqual({ ok: false, error: "Neplatná priorita." });
  });
});

describe("validateTreeDepth — Security Phase 12", () => {
  it("Oblast (0 předků) projde", () => {
    expect(validateTreeDepth(0)).toEqual({ ok: true });
  });

  it("Téma pod Podoblastí (2 předci) projde — 3. úroveň", () => {
    expect(validateTreeDepth(2)).toEqual({ ok: true });
  });

  it("4. úroveň (3 předci) = DENY", () => {
    const result = validateTreeDepth(3);
    expect(result.ok).toBe(false);
  });
});

describe("validateStatusInput — Security Phase 12", () => {
  it("platný vstup projde", () => {
    expect(validateStatusInput({ status: "red", reason: "Lednice hlásí chybu." })).toEqual({
      ok: true,
      value: { status: "red", reason: "Lednice hlásí chybu." },
    });
  });

  it("neplatný stav = DENY", () => {
    expect(validateStatusInput({ status: "blue", reason: "cokoliv" }).ok).toBe(false);
  });

  it("chybějící důvod = DENY", () => {
    expect(validateStatusInput({ status: "amber", reason: "   " })).toEqual({
      ok: false,
      error: "Zadejte důvod ruční změny stavu.",
    });
  });
});

describe("validatePriorityInput — Security Phase 12", () => {
  it("platná priorita projde", () => {
    expect(validatePriorityInput("critical")).toEqual({ ok: true, value: "critical" });
  });

  it("neplatná priorita = DENY", () => {
    expect(validatePriorityInput("urgent").ok).toBe(false);
  });
});

describe("validateCommentInput — Security Phase 12", () => {
  it("platný komentář projde", () => {
    expect(validateCommentInput({ body: "  Řeším to zítra.  " })).toEqual({
      ok: true,
      value: { body: "Řeším to zítra." },
    });
  });

  it("prázdný komentář = DENY", () => {
    expect(validateCommentInput({ body: "   " })).toEqual({
      ok: false,
      error: "Zadejte text komentáře.",
    });
  });
});

describe("validateClaimInput — Security Phase 12", () => {
  it("prázdný text je povolený (nahradí se výchozí zprávou v datové vrstvě)", () => {
    expect(validateClaimInput("   ")).toEqual({ ok: true, value: "" });
  });

  it("příliš dlouhý text = DENY", () => {
    expect(validateClaimInput("a".repeat(2001)).ok).toBe(false);
  });
});
