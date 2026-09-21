import { describe, expect, it } from "vitest";
import { validateCompanyNoteInput } from "../companyNoteValidation";

describe("validateCompanyNoteInput — Security Phase 10", () => {
  it("platný vstup projde a ořízne mezery", () => {
    const result = validateCompanyNoteInput({ title: "  Schůzka  ", body: "  Závěry ze schůzky  " });
    expect(result).toEqual({ ok: true, value: { title: "Schůzka", body: "Závěry ze schůzky" } });
  });

  it("prázdný název = DENY", () => {
    expect(validateCompanyNoteInput({ title: "  ", body: "text" })).toEqual({
      ok: false,
      error: "Zadejte název zápisu.",
    });
  });

  it("prázdný text = DENY", () => {
    expect(validateCompanyNoteInput({ title: "Název", body: "   " })).toEqual({
      ok: false,
      error: "Zadejte text zápisu.",
    });
  });

  it("příliš dlouhý název = DENY", () => {
    const result = validateCompanyNoteInput({ title: "a".repeat(201), body: "text" });
    expect(result.ok).toBe(false);
  });

  it("příliš dlouhý text = DENY", () => {
    const result = validateCompanyNoteInput({ title: "Název", body: "a".repeat(5001) });
    expect(result.ok).toBe(false);
  });
});
