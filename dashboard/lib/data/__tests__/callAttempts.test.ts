import { describe, expect, it } from "vitest";
import { countConsecutiveNoAnswers, planNextAttempt, requireNextContactError, smsText } from "../callAttempts";

// Kadence 26. 11. 2026: den 1 → 3 → 10 → 20 → Newsletter (CET = UTC+1)
const at = (iso: string) => new Date(iso);

describe("planNextAttempt (den 1/3/10/20)", () => {
  it("1. pokus ráno → za 2 dny odpoledne 14:00", () => {
    const now = at("2026-11-25T09:00:00Z"); // st 10:00
    const p = planNextAttempt({ failedAttempt: 1, now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-27T13:00:00.000Z"); // pá 14:00
    expect(p.nextStepNote).toContain("pokus 2/4 (den 3)");
    expect(p.stop).toBe(false);
  });

  it("odpoledne → další pokus ráno 9:30, víkend se přeskočí", () => {
    const now = at("2026-11-26T14:00:00Z"); // čt 15:00 → +2 = so → po
    const p = planNextAttempt({ failedAttempt: 1, now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-30T08:30:00.000Z"); // po 9:30
  });

  it("2. pokus → za 7 dní (den 10)", () => {
    const now = at("2026-11-27T13:00:00Z"); // pá 14:00
    const p = planNextAttempt({ failedAttempt: 2, now });
    expect(p.nextAt?.toISOString()).toBe("2026-12-04T08:30:00.000Z"); // pá 9:30
  });

  it("3. pokus → za 10 dní (den 20) + poslední e-mail", () => {
    const now = at("2026-12-04T08:30:00Z");
    const p = planNextAttempt({ failedAttempt: 3, now });
    expect(p.nextAt?.toISOString()).toBe("2026-12-14T13:00:00.000Z"); // po 14:00
    expect(p.suggestEmail).toBe(true);
    expect(p.nextStepNote).toContain("poslední e-mail");
  });

  it("4. pokus → konec, Newsletter, žádný termín", () => {
    const p = planNextAttempt({ failedAttempt: 4, now: at("2026-12-14T13:00:00Z") });
    expect(p.stop).toBe(true);
    expect(p.nextAt).toBeNull();
    expect(p.remindAt).toBeNull();
    expect(p.label).toContain("Newsletter");
  });
});

describe("requireNextContactError", () => {
  const now = at("2026-11-26T10:00:00Z");
  it("aktivní lead bez termínu → chyba", () => {
    expect(requireNextContactError({ finalStageActive: true, effectiveNextFollowUpAt: null, now })).toMatch(/Doplňte datum/);
  });
  it("aktivní lead s termínem v minulosti → chyba", () => {
    expect(requireNextContactError({ finalStageActive: true, effectiveNextFollowUpAt: at("2026-11-26T08:00:00Z"), now })).not.toBeNull();
  });
  it("aktivní lead s budoucím termínem → OK", () => {
    expect(requireNextContactError({ finalStageActive: true, effectiveNextFollowUpAt: at("2026-11-27T08:00:00Z"), now })).toBeNull();
  });
  it("neaktivní lead (Nezájem, Zákazník, Newsletter) → OK i bez termínu", () => {
    expect(requireNextContactError({ finalStageActive: false, effectiveNextFollowUpAt: null, now })).toBeNull();
  });
});

describe("countConsecutiveNoAnswers", () => {
  it("počítá jen nezvednuté od posledního hovoru", () => {
    expect(
      countConsecutiveNoAnswers([
        { kind: "call_logged", metadata: { callResult: "no_answer" } },
        { kind: "call_logged", metadata: { callResult: "no_answer" } },
        { kind: "call_logged", metadata: { callResult: "reached_interested" } },
        { kind: "call_logged", metadata: { callResult: "no_answer" } },
      ])
    ).toBe(2);
  });
});

it("SMS s křestním jménem", () => {
  expect(smsText("Jaroslav Viner")).toContain("tady Jaroslav z Beginy");
});
