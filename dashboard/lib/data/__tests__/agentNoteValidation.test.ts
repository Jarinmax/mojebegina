// GPT/MCP pilot — validace poznámky, dalšího kroku u leadu a hledání.
import { describe, expect, it } from "vitest";
import { likePattern, validateNextStepInput, validateNoteInput } from "../leadValidation";

describe("validateNoteInput", () => {
  it("ořez, prázdná a příliš dlouhá poznámka", () => {
    expect(validateNoteInput("  ahoj ")).toEqual({ ok: true, value: "ahoj" });
    expect(validateNoteInput("   ").ok).toBe(false);
    expect(validateNoteInput("x".repeat(2001)).ok).toBe(false);
  });
});

describe("validateNextStepInput", () => {
  it("krok, datum nebo obojí; datum na 12:00 UTC", () => {
    expect(validateNextStepInput({ nextStepNote: " Poslat ceník ", nextFollowUpAt: "" })).toEqual({
      ok: true,
      value: { nextStepNote: "Poslat ceník", nextFollowUpAt: null },
    });
    const withDate = validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "2026-10-20" });
    expect(withDate.ok && withDate.value.nextFollowUpAt?.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  it.each(["2026-02-30", "20. 10. 2026", "2026-10-20T10:00", "zítra"])("neplatné datum %s", (date) => {
    expect(validateNextStepInput({ nextStepNote: "x", nextFollowUpAt: date }).ok).toBe(false);
  });

  it("prázdný požadavek a příliš dlouhý krok", () => {
    expect(validateNextStepInput({ nextStepNote: " ", nextFollowUpAt: "" }).ok).toBe(false);
    expect(validateNextStepInput({ nextStepNote: "x".repeat(501), nextFollowUpAt: "" }).ok).toBe(false);
  });
});

describe("likePattern", () => {
  it("hledá doslovný text", () => {
    expect(likePattern("U Lípy")).toBe("%U Lípy%");
    expect(likePattern("50%_sleva\\")).toBe("%50\\%\\_sleva\\\\%");
  });
});
