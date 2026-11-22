import { describe, expect, it } from "vitest";
import { countConsecutiveNoAnswers, planNextAttempt, smsText } from "../callAttempts";

// Středa 25. 11. 2026 (CET = UTC+1)
const at = (iso: string) => new Date(iso);

describe("planNextAttempt", () => {
  it("čerstvý lead → za 10 minut", () => {
    const now = at("2026-11-25T09:00:00Z"); // 10:00 Praha
    const p = planNextAttempt({ failedAttempt: 1, leadCreatedAt: at("2026-11-25T08:40:00Z"), now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-25T09:10:00.000Z");
    expect(p.label).toContain("Pokus 1/4");
  });

  it("čerstvý lead večer → ne v noci, ale další pracovní den 9:30", () => {
    const now = at("2026-11-25T19:00:00Z"); // 20:00 Praha
    const p = planNextAttempt({ failedAttempt: 1, leadCreatedAt: now, now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-26T08:30:00.000Z");
  });

  it("starší lead → za 2,5 h, ale mimo oběd", () => {
    const now = at("2026-11-25T08:30:00Z"); // 9:30 → 12:00 → posun na 14:30
    const p = planNextAttempt({ failedAttempt: 1, leadCreatedAt: at("2026-11-01T08:00:00Z"), now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-25T13:30:00.000Z");
  });

  it("2. pokus ráno → další pracovní den odpoledne", () => {
    const now = at("2026-11-27T09:00:00Z"); // pátek 10:00
    const p = planNextAttempt({ failedAttempt: 2, leadCreatedAt: at("2026-11-01T08:00:00Z"), now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-30T13:30:00.000Z"); // pondělí 14:30
  });

  it("3. pokus → za 3 pracovní dny + e-mail", () => {
    const now = at("2026-11-25T14:00:00Z");
    const p = planNextAttempt({ failedAttempt: 3, leadCreatedAt: at("2026-11-01T08:00:00Z"), now });
    expect(p.nextAt?.toISOString()).toBe("2026-11-30T09:00:00.000Z");
    expect(p.suggestEmail).toBe(true);
  });

  it("4. pokus → konec, připomínka za měsíc", () => {
    const now = at("2026-11-25T14:00:00Z");
    const p = planNextAttempt({ failedAttempt: 4, leadCreatedAt: at("2026-11-01T08:00:00Z"), now });
    expect(p.stop).toBe(true);
    expect(p.nextAt).toBeNull();
    expect(p.remindAt!.getTime()).toBeGreaterThan(now.getTime() + 27 * 86400000);
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
