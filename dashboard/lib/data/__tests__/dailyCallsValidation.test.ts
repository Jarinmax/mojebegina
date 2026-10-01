import { describe, expect, it } from "vitest";
import {
  validateDailyCallOutcomeInput,
  canAddManualCandidate,
  classifyAutoCandidate,
  orderAutoCandidates,
  autoCandidatesToAdd,
  interpretCallLogOutcome,
  swapAdjacent,
  pragueDateString,
  MAX_QUEUE_SIZE,
  FOLLOW_UP_COOLDOWN_DAYS,
  type AutoCandidateLeadRow,
} from "../dailyCallsValidation";

function baseOutcome(overrides: Partial<Parameters<typeof validateDailyCallOutcomeInput>[0]> = {}) {
  return {
    result: "reached_interested",
    note: "Mluvili jsme, pošlu vzorek.",
    stageChange: "",
    nextFollowUpAt: "",
    ...overrides,
  };
}

// Security Phase 19 — výsledek hovoru NENÍ obchodní fáze (schváleno
// explicitně, revize návrhu bod 2): výsledek a poznámka povinné, fáze
// nepovinná s výchozí "neměnit", datum povinné jen pro "zavolat později".
describe("validateDailyCallOutcomeInput — Security Phase 19", () => {
  it("platný vstup s výsledkem a poznámkou projde, fáze zůstává null", () => {
    const result = validateDailyCallOutcomeInput(baseOutcome());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("reached_interested");
      expect(result.value.stageChange).toBeNull();
    }
  });

  it("chybějící výsledek je DENY", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ result: "" })).ok).toBe(false);
  });

  it("neplatný výsledek je DENY (žádné 'beze změny' u výsledku)", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ result: "beze_zmeny" })).ok).toBe(false);
  });

  it("chybějící poznámka je DENY, i když je výsledek vyplněný", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ note: "   " })).ok).toBe(false);
  });

  it("volitelná fáze — platná hodnota projde a uloží se", () => {
    const result = validateDailyCallOutcomeInput(baseOutcome({ stageChange: "interested" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stageChange).toBe("interested");
    }
  });

  it("neplatná fáze je DENY", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ stageChange: "nesmysl" })).ok).toBe(false);
  });

  it("výsledek 'call_back_later' BEZ data je DENY", () => {
    const result = validateDailyCallOutcomeInput(baseOutcome({ result: "call_back_later", nextFollowUpAt: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Zavolat později/);
    }
  });

  it("výsledek 'call_back_later' S datem projde", () => {
    const result = validateDailyCallOutcomeInput(
      baseOutcome({ result: "call_back_later", nextFollowUpAt: "2026-10-05" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextFollowUpAt).not.toBeNull();
    }
  });

  it("jiný výsledek než 'call_back_later' nevyžaduje datum", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ result: "no_answer", nextFollowUpAt: "" })).ok).toBe(true);
  });

  it("neplatné datum je DENY", () => {
    expect(
      validateDailyCallOutcomeInput(baseOutcome({ result: "call_back_later", nextFollowUpAt: "not-a-date" })).ok
    ).toBe(false);
  });
});

const NOW = new Date("2026-10-01T10:00:00.000Z"); // Europe/Prague: 2026-10-01 12:00 (CEST)

function autoCandidate(overrides: Partial<AutoCandidateLeadRow> = {}): AutoCandidateLeadRow {
  return {
    id: "lead-1",
    lastContactedAt: null,
    nextFollowUpAt: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// Security Phase 19.2 — třívrstvé pravidlo schválené po druhé revizi:
// dřívější kontakt leada NEVYLUČUJE (pořád potenciální zákazník), jen ho
// zařadí do jiné vrstvy a chrání 30denní lhůtou. Závazné pořadí
// vyhodnocení: budoucí nextFollowUpAt vyřazuje PŘED čímkoliv dalším.
describe("classifyAutoCandidate — Security Phase 19.2", () => {
  it("lead bez kontaktu, bez termínu → tier2", () => {
    expect(classifyAutoCandidate(autoCandidate(), NOW)).toBe("tier2");
  });

  it("nextFollowUpAt dnes → tier1", () => {
    const lead = autoCandidate({ nextFollowUpAt: new Date("2026-10-01T12:00:00.000Z") });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier1");
  });

  it("nextFollowUpAt v minulosti (po termínu) → tier1", () => {
    const lead = autoCandidate({ nextFollowUpAt: new Date("2026-09-20T12:00:00.000Z") });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier1");
  });

  it("DŮLEŽITÉ: lastContactedAt=NULL, ale nextFollowUpAt v budoucnu → excluded, NESMÍ spadnout do tier2", () => {
    const lead = autoCandidate({
      lastContactedAt: null,
      nextFollowUpAt: new Date("2026-10-15T12:00:00.000Z"),
    });
    expect(classifyAutoCandidate(lead, NOW)).toBe("excluded");
  });

  it("nextFollowUpAt v budoucnu i s vyplněným lastContactedAt → excluded (respektuje domluvený termín)", () => {
    const lead = autoCandidate({
      lastContactedAt: new Date("2026-08-01"),
      nextFollowUpAt: new Date("2026-10-15T12:00:00.000Z"),
    });
    expect(classifyAutoCandidate(lead, NOW)).toBe("excluded");
  });

  it("bez termínu, lastContactedAt přesně 30 dní zpátky → tier3 (lhůta uplynula)", () => {
    const lead = autoCandidate({ lastContactedAt: new Date(NOW.getTime() - FOLLOW_UP_COOLDOWN_DAYS * 86400000) });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier3");
  });

  it("bez termínu, lastContactedAt 29 dní zpátky → excluded (lhůta ještě neuplynula)", () => {
    const lead = autoCandidate({ lastContactedAt: new Date(NOW.getTime() - 29 * 86400000) });
    expect(classifyAutoCandidate(lead, NOW)).toBe("excluded");
  });

  it("bez termínu, lastContactedAt dávno v minulosti → tier3", () => {
    const lead = autoCandidate({ lastContactedAt: new Date("2026-01-01") });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier3");
  });
});

describe("orderAutoCandidates — Security Phase 19.2", () => {
  it("pořadí vrstev je vždy tier1 → tier2 → tier3, excluded se nikam nezařadí", () => {
    const t1 = autoCandidate({ id: "t1", nextFollowUpAt: new Date("2026-09-25T12:00:00.000Z") });
    const t2 = autoCandidate({ id: "t2" });
    const t3 = autoCandidate({ id: "t3", lastContactedAt: new Date("2026-01-01") });
    const excluded = autoCandidate({ id: "excluded", lastContactedAt: new Date(NOW.getTime() - 5 * 86400000) });

    const result = orderAutoCandidates([t3, excluded, t2, t1], NOW);
    expect(result.map((c) => c.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("tier1 se řadí od nejvíc prošlého termínu", () => {
    const soon = autoCandidate({ id: "soon", nextFollowUpAt: new Date("2026-10-01T12:00:00.000Z") });
    const overdue = autoCandidate({ id: "overdue", nextFollowUpAt: new Date("2026-09-01T12:00:00.000Z") });
    const result = orderAutoCandidates([soon, overdue], NOW);
    expect(result.map((c) => c.id)).toEqual(["overdue", "soon"]);
  });

  it("tier2 se řadí od nejstaršího createdAt", () => {
    const older = autoCandidate({ id: "older", createdAt: new Date("2026-01-01") });
    const newer = autoCandidate({ id: "newer", createdAt: new Date("2026-06-01") });
    expect(orderAutoCandidates([newer, older], NOW).map((c) => c.id)).toEqual(["older", "newer"]);
  });

  it("tier3 se řadí od nejstaršího lastContactedAt (nejdéle nekontaktovaný první)", () => {
    const longAgo = autoCandidate({ id: "long-ago", lastContactedAt: new Date("2026-01-01") });
    const lessLongAgo = autoCandidate({ id: "less-long-ago", lastContactedAt: new Date("2026-06-01") });
    expect(orderAutoCandidates([lessLongAgo, longAgo], NOW).map((c) => c.id)).toEqual(["long-ago", "less-long-ago"]);
  });

  it("stabilní tiebreak na id uvnitř každé vrstvy", () => {
    const sameCreatedAt = new Date("2026-01-01");
    const b = autoCandidate({ id: "bbbb", createdAt: sameCreatedAt });
    const a = autoCandidate({ id: "aaaa", createdAt: sameCreatedAt });
    expect(orderAutoCandidates([b, a], NOW).map((c) => c.id)).toEqual(["aaaa", "bbbb"]);
  });
});

describe("autoCandidatesToAdd — Security Phase 19.2", () => {
  it("doplní jen do MAX_QUEUE_SIZE, ne víc", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      autoCandidate({ id: `id-${i}`, createdAt: new Date(`2026-01-${(i % 28) + 1}`) })
    );
    expect(autoCandidatesToAdd(0, candidates, NOW)).toHaveLength(MAX_QUEUE_SIZE);
  });

  it("respektuje počet už nevyřízených položek", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => autoCandidate({ id: `id-${i}` }));
    expect(autoCandidatesToAdd(7, candidates, NOW)).toHaveLength(3);
  });

  it("fronta už plná (>= 10) → nic nepřidá", () => {
    const candidates = [autoCandidate()];
    expect(autoCandidatesToAdd(10, candidates, NOW)).toHaveLength(0);
    expect(autoCandidatesToAdd(12, candidates, NOW)).toHaveLength(0);
  });

  it("excluded kandidáti se nepočítají do doplnění, i kdyby byli jediní v poolu", () => {
    const excluded = autoCandidate({ lastContactedAt: new Date(NOW.getTime() - 5 * 86400000) });
    expect(autoCandidatesToAdd(0, [excluded], NOW)).toHaveLength(0);
  });
});

// Regrese na bug nahlášený na Preview: ruční přidání limit MAX_QUEUE_SIZE
// nekontrolovalo vůbec (na rozdíl od automatického návrhu přes
// candidatesToAdd výše), fronta mohla přerůst 10/10.
describe("canAddManualCandidate — Security Phase 19", () => {
  it("při 10 pending položkách (MAX_QUEUE_SIZE) nelze přidat jedenáctou", () => {
    const result = canAddManualCandidate(MAX_QUEUE_SIZE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Fronta už obsahuje maximálních 10 kontaktů. Nejdřív některý odeberte.");
    }
  });

  it("nad limitem (např. po souběžném zápisu) je také DENY", () => {
    expect(canAddManualCandidate(MAX_QUEUE_SIZE + 1).ok).toBe(false);
  });

  it("pod limitem je povoleno", () => {
    expect(canAddManualCandidate(MAX_QUEUE_SIZE - 1)).toEqual({ ok: true });
  });

  it("prázdná fronta je povolena", () => {
    expect(canAddManualCandidate(0)).toEqual({ ok: true });
  });
});

describe("interpretCallLogOutcome — Security Phase 19", () => {
  it("0 vrácených řádků = souběžný/opakovaný zápis, DENY", () => {
    const result = interpretCallLogOutcome(0);
    expect(result.ok).toBe(false);
  });

  it("1 vrácený řádek = úspěch", () => {
    expect(interpretCallLogOutcome(1)).toEqual({ ok: true });
  });
});

describe("swapAdjacent — Security Phase 19 (prohození sousedních položek)", () => {
  it("posun nahoru prohodí položku se sousedem před ní", () => {
    expect(swapAdjacent(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("posun dolů prohodí položku se sousedem za ní", () => {
    expect(swapAdjacent(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("první položku nelze posunout výš", () => {
    expect(swapAdjacent(["a", "b", "c"], 0, "up")).toBeNull();
  });

  it("poslední položku nelze posunout níž", () => {
    expect(swapAdjacent(["a", "b", "c"], 2, "down")).toBeNull();
  });

  it("neplatný index vrátí null", () => {
    expect(swapAdjacent(["a", "b"], -1, "up")).toBeNull();
    expect(swapAdjacent(["a", "b"], 5, "up")).toBeNull();
  });

  it("nemění původní pole (čistá funkce)", () => {
    const original = ["a", "b", "c"];
    swapAdjacent(original, 1, "up");
    expect(original).toEqual(["a", "b", "c"]);
  });
});

describe("pragueDateString — Security Phase 19", () => {
  it("vrací formát YYYY-MM-DD", () => {
    expect(pragueDateString(new Date("2026-06-15T10:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("respektuje Europe/Prague posun kolem půlnoci UTC (léto, UTC+2)", () => {
    // 23:30 UTC v létě = 01:30 následujícího dne v Praze
    expect(pragueDateString(new Date("2026-06-15T23:30:00Z"))).toBe("2026-06-16");
  });
});
