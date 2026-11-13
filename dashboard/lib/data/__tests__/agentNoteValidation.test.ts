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
  it("krok, datum nebo obojí; datum bez času = 09:00 Europe/Prague (Etapa 0)", () => {
    expect(validateNextStepInput({ nextStepNote: " Poslat ceník ", nextFollowUpAt: "" })).toEqual({
      ok: true,
      value: { nextStepNote: "Poslat ceník", nextFollowUpAt: null, clearFollowUp: false },
    });
    // 20. 10. 2026 = letní čas (UTC+2), 2. 11. 2026 = zimní čas (UTC+1)
    const summer = validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "2026-10-20" });
    expect(summer.ok && summer.value.nextFollowUpAt?.toISOString()).toBe("2026-10-20T07:00:00.000Z");
    const winter = validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "2026-11-02" });
    expect(winter.ok && winter.value.nextFollowUpAt?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    const withTime = validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "2026-11-02", nextFollowUpTime: "14:30" });
    expect(withTime.ok && withTime.value.nextFollowUpAt?.toISOString()).toBe("2026-11-02T13:30:00.000Z");
  });

  it("výslovné smazání termínu (Etapa 0, rozhodnutí 6)", () => {
    expect(validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "", clearFollowUp: true })).toEqual({
      ok: true,
      value: { nextStepNote: null, nextFollowUpAt: null, clearFollowUp: true },
    });
    expect(validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "2026-11-02", clearFollowUp: true }).ok).toBe(false);
  });

  it.each(["9:00", "0900", "09:00:00", "ráno"])("neplatný čas %s", (time) => {
    expect(validateNextStepInput({ nextStepNote: "", nextFollowUpAt: "2026-11-02", nextFollowUpTime: time }).ok).toBe(false);
  });

  it("čas bez data je DENY", () => {
    expect(validateNextStepInput({ nextStepNote: "x", nextFollowUpAt: "", nextFollowUpTime: "10:00" }).ok).toBe(false);
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
