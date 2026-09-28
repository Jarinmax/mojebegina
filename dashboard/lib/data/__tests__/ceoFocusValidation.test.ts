import { describe, expect, it } from "vitest";
import {
  validateCreateFocusProjectInput,
  validateUpdateFocusProjectInput,
  validateFocusCommentInput,
  compareFocusProjectsForList,
  type FocusProjectSortRow,
} from "../ceoFocusValidation";

describe("validateCreateFocusProjectInput — Security Phase 17", () => {
  it("platný název projde a ořízne mezery", () => {
    const result = validateCreateFocusProjectInput({ title: "  Begina.cz – nový web  " });
    expect(result).toEqual({ ok: true, value: { title: "Begina.cz – nový web" } });
  });

  it("prázdný název je DENY", () => {
    expect(validateCreateFocusProjectInput({ title: "   " }).ok).toBe(false);
  });

  it("příliš dlouhý název je DENY", () => {
    expect(validateCreateFocusProjectInput({ title: "a".repeat(201) }).ok).toBe(false);
  });
});

function baseUpdate(overrides: Partial<Parameters<typeof validateUpdateFocusProjectInput>[0]> = {}) {
  return {
    note: "",
    status: "",
    statusReason: "",
    priority: "",
    description: "",
    nextStep: "",
    ...overrides,
  };
}

describe("validateUpdateFocusProjectInput — Security Phase 17", () => {
  it("úplně prázdné odeslání je DENY (stejná UX past jako CallLogForm, Security Phase 16.5)", () => {
    const result = validateUpdateFocusProjectInput(baseUpdate());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/prázdná/i);
    }
  });

  it("jen poznámka bez čehokoliv dalšího je povolené", () => {
    expect(validateUpdateFocusProjectInput(baseUpdate({ note: "Domluveno s dodavatelem." })).ok).toBe(true);
  });

  it("jen status je povolené", () => {
    const result = validateUpdateFocusProjectInput(baseUpdate({ status: "red" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("red");
      expect(result.value.priority).toBeNull();
    }
  });

  it("neplatný status je DENY", () => {
    expect(validateUpdateFocusProjectInput(baseUpdate({ status: "blue" })).ok).toBe(false);
  });

  it("neplatná priorita je DENY", () => {
    expect(validateUpdateFocusProjectInput(baseUpdate({ priority: "urgent" })).ok).toBe(false);
  });

  it("jen další krok je povolené", () => {
    const result = validateUpdateFocusProjectInput(baseUpdate({ nextStep: "Poslat návrh smlouvy." }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextStep).toBe("Poslat návrh smlouvy.");
    }
  });

  it("kompletní vstup projde a ořízne mezery", () => {
    const result = validateUpdateFocusProjectInput({
      note: "  Aktualizace  ",
      status: "amber",
      statusReason: "  Čekáme na grafika  ",
      priority: "high",
      description: "  Návrh homepage  ",
      nextStep: "  Schválit s klientem  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        note: "Aktualizace",
        status: "amber",
        statusReason: "Čekáme na grafika",
        priority: "high",
        description: "Návrh homepage",
        nextStep: "Schválit s klientem",
      });
    }
  });

  it("příliš dlouhá poznámka je DENY", () => {
    expect(validateUpdateFocusProjectInput(baseUpdate({ note: "a".repeat(2001) })).ok).toBe(false);
  });

  it("příliš dlouhý blocker/důvod je DENY", () => {
    expect(validateUpdateFocusProjectInput(baseUpdate({ status: "red", statusReason: "a".repeat(501) })).ok).toBe(
      false
    );
  });
});

describe("validateFocusCommentInput — Security Phase 17", () => {
  it("platný text projde", () => {
    expect(validateFocusCommentInput({ body: "  Poznámka  " })).toEqual({ ok: true, value: "Poznámka" });
  });

  it("prázdný text je DENY", () => {
    expect(validateFocusCommentInput({ body: "   " }).ok).toBe(false);
  });
});

function sortRow(overrides: Partial<FocusProjectSortRow> = {}): FocusProjectSortRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    priority: "medium",
    isActiveNow: false,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// Security Phase 17 — stejný princip jako compareLeadsForList (Security
// Phase 16.4): aktivní projekt musí být VŽDY první ("na čem pracuji TEĎ
// musí být vidět okamžitě" ze zadání), a řazení musí být stabilní vůči
// update jednotlivého projektu.
describe("compareFocusProjectsForList — Security Phase 17", () => {
  it("aktivní projekt je vždy první, i před kritickou prioritou jiného", () => {
    const active = sortRow({ id: "a", priority: "low", isActiveNow: true });
    const criticalOther = sortRow({ id: "b", priority: "critical", isActiveNow: false });
    expect(compareFocusProjectsForList(active, criticalOther)).toBeLessThan(0);
  });

  it("mezi neaktivními vyhrává vyšší priorita (critical > high > medium > low)", () => {
    const critical = sortRow({ id: "a", priority: "critical" });
    const low = sortRow({ id: "b", priority: "low" });
    expect(compareFocusProjectsForList(critical, low)).toBeLessThan(0);
  });

  it("při shodné prioritě vyhrává novější aktualizace", () => {
    const newer = sortRow({ id: "a", updatedAt: new Date("2026-03-01") });
    const older = sortRow({ id: "b", updatedAt: new Date("2026-01-01") });
    expect(compareFocusProjectsForList(newer, older)).toBeLessThan(0);
  });

  it("při shodné prioritě i čase rozhoduje id jako definitivní tiebreak", () => {
    const sameTime = new Date("2026-01-01T00:00:00Z");
    const rowA = sortRow({ id: "aaaa", updatedAt: sameTime });
    const rowB = sortRow({ id: "bbbb", updatedAt: sameTime });
    expect(compareFocusProjectsForList(rowA, rowB)).toBeLessThan(0);
    expect(compareFocusProjectsForList(rowB, rowA)).toBeGreaterThan(0);
  });

  it("řazení je stabilní a deterministické i při opakovaném volání", () => {
    const rows: FocusProjectSortRow[] = [
      sortRow({ id: "c", priority: "low" }),
      sortRow({ id: "a", priority: "critical", isActiveNow: true }),
      sortRow({ id: "b", priority: "high" }),
    ];
    const firstRun = [...rows].sort(compareFocusProjectsForList).map((r) => r.id);
    const secondRun = [...rows].sort(compareFocusProjectsForList).map((r) => r.id);
    expect(secondRun).toEqual(firstRun);
    expect(firstRun).toEqual(["a", "b", "c"]);
  });
});
