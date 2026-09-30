import { describe, expect, it } from "vitest";
import {
  validateDailyCallOutcomeInput,
  candidatesToAdd,
  canAddManualCandidate,
  isEligibleAutoCandidate,
  interpretCallLogOutcome,
  swapAdjacent,
  pragueDateString,
  MAX_QUEUE_SIZE,
  type CandidateLeadRow,
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

function candidate(id: string, createdAt: string): CandidateLeadRow {
  return { id, createdAt: new Date(createdAt) };
}

describe("candidatesToAdd — Security Phase 19", () => {
  it("doplní jen do MAX_QUEUE_SIZE, ne víc", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => candidate(`id-${i}`, `2026-01-${(i % 28) + 1}`));
    const result = candidatesToAdd(0, candidates);
    expect(result).toHaveLength(MAX_QUEUE_SIZE);
  });

  it("respektuje počet už nevyřízených položek", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => candidate(`id-${i}`, "2026-01-01"));
    expect(candidatesToAdd(7, candidates)).toHaveLength(3);
  });

  it("fronta už plná (>= 10) → nic nepřidá", () => {
    const candidates = [candidate("a", "2026-01-01")];
    expect(candidatesToAdd(10, candidates)).toHaveLength(0);
    expect(candidatesToAdd(12, candidates)).toHaveLength(0);
  });

  it("řadí od nejstaršího createdAt", () => {
    const older = candidate("older", "2026-01-01");
    const newer = candidate("newer", "2026-06-01");
    const result = candidatesToAdd(0, [newer, older]);
    expect(result.map((c) => c.id)).toEqual(["older", "newer"]);
  });

  it("stabilní tiebreak na id při shodném createdAt", () => {
    const sameTime = "2026-01-01T00:00:00Z";
    const a = candidate("aaaa", sameTime);
    const b = candidate("bbbb", sameTime);
    expect(candidatesToAdd(0, [b, a]).map((c) => c.id)).toEqual(["aaaa", "bbbb"]);
  });
});

const BLAHOUT_ID = "06240ac4-c050-47ea-998c-6c81389edf9f";

function autoCandidate(overrides: Partial<AutoCandidateLeadRow> = {}): AutoCandidateLeadRow {
  return {
    id: "lead-1",
    stage: "new",
    contactPhone: "+420 777 123 456",
    lastContactedAt: null,
    ownerUserId: BLAHOUT_ID,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// Security Phase 19.1 — oprava pravidla po auditu Preview dat: leady ve
// fázi contacted/sample_offer/callback_later/interested mají
// lastContactedAt skoro vždy NULL jen kvůli tomu, jak import zapsal
// historii (viz komentář u isEligibleAutoCandidate). Jediná spolehlivá
// fáze je 'new'.
describe("isEligibleAutoCandidate — Security Phase 19.1", () => {
  it("lead ve fázi 'new', bez kontaktu, s telefonem, patřící Blahoutovi — projde", () => {
    expect(isEligibleAutoCandidate(autoCandidate(), BLAHOUT_ID)).toBe(true);
  });

  it("fáze 'contacted' (i s lastContactedAt NULL) NEprojde — regrese na chybu z Preview", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ stage: "contacted" }), BLAHOUT_ID)).toBe(false);
  });

  it("fáze 'callback_later' NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ stage: "callback_later" }), BLAHOUT_ID)).toBe(false);
  });

  it("fáze 'sample_offer' NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ stage: "sample_offer" }), BLAHOUT_ID)).toBe(false);
  });

  it("fáze 'interested' NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ stage: "interested" }), BLAHOUT_ID)).toBe(false);
  });

  it("lastContactedAt vyplněné NEprojde, i kdyby byla fáze 'new'", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ lastContactedAt: new Date() }), BLAHOUT_ID)).toBe(false);
  });

  it("jiný vlastník než Blahout NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ ownerUserId: "jiny-user-id" }), BLAHOUT_ID)).toBe(false);
  });

  it("bez vlastníka (NULL) NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ ownerUserId: null }), BLAHOUT_ID)).toBe(false);
  });

  it("prázdný telefon NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ contactPhone: "" }), BLAHOUT_ID)).toBe(false);
  });

  it("telefon jen z mezer NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ contactPhone: "   " }), BLAHOUT_ID)).toBe(false);
  });

  it("chybějící telefon (NULL) NEprojde", () => {
    expect(isEligibleAutoCandidate(autoCandidate({ contactPhone: null }), BLAHOUT_ID)).toBe(false);
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
