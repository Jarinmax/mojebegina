import { describe, expect, it } from "vitest";
import {
  validateCreateLeadInput,
  validateStageInput,
  validateCallLogInput,
  validateCompanyNameInput,
  isFollowUpOverdue,
  leadDisplayName,
  compareLeadsForList,
  type CreateLeadInput,
  type LeadSortRow,
} from "../leadValidation";

function baseInput(overrides: Partial<CreateLeadInput> = {}): CreateLeadInput {
  return {
    companyName: "Kavárna U Nádraží",
    contactName: "Jana Nová",
    contactPhone: "+420111222333",
    contactEmail: "jana@example.com",
    city: "Brno",
    address: "",
    venueType: "kavarna",
    ico: "",
    source: "existing_database",
    ...overrides,
  };
}

describe("validateCreateLeadInput — Security Phase 16", () => {
  it("platný vstup projde, ořízne mezery", () => {
    const result = validateCreateLeadInput(baseInput({ companyName: "  Kavárna U Nádraží  " }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.companyName).toBe("Kavárna U Nádraží");
      expect(result.value.venueType).toBe("kavarna");
      expect(result.value.source).toBe("existing_database");
    }
  });

  it("prázdné nepovinné údaje se uloží jako null", () => {
    const result = validateCreateLeadInput(
      baseInput({ contactName: "", contactPhone: "", contactEmail: "", city: "", venueType: "", ico: "" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contactName).toBeNull();
      expect(result.value.contactEmail).toBeNull();
      expect(result.value.venueType).toBeNull();
      expect(result.value.ico).toBeNull();
    }
  });

  it("chybějící companyName je povolené, pokud je jiný identifikátor (Security Phase 16.1)", () => {
    const result = validateCreateLeadInput(baseInput({ companyName: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.companyName).toBeNull();
    }
  });

  it("úplně prázdný vstup (bez firmy, jména, telefonu i e-mailu) = DENY", () => {
    const result = validateCreateLeadInput(
      baseInput({ companyName: "", contactName: "", contactPhone: "", contactEmail: "" })
    );
    expect(result).toEqual({
      ok: false,
      error: "Vyplňte alespoň jeden identifikující údaj (firma, kontaktní osoba, telefon nebo e-mail).",
    });
  });

  it("jen telefon bez ostatních identifikátorů projde", () => {
    const result = validateCreateLeadInput(
      baseInput({ companyName: "", contactName: "", contactEmail: "", contactPhone: "+420111222333" })
    );
    expect(result.ok).toBe(true);
  });

  it("neplatný e-mail = DENY", () => {
    expect(validateCreateLeadInput(baseInput({ contactEmail: "neplatny" })).ok).toBe(false);
  });

  it("neplatný typ provozu = DENY", () => {
    expect(validateCreateLeadInput(baseInput({ venueType: "vesmirna-stanice" })).ok).toBe(false);
  });

  it("neplatný zdroj = DENY", () => {
    expect(validateCreateLeadInput(baseInput({ source: "neco-jineho" })).ok).toBe(false);
  });

  it("neplatné IČO (písmena) = DENY", () => {
    expect(validateCreateLeadInput(baseInput({ ico: "abc123" })).ok).toBe(false);
  });

  it("platné částečné IČO projde (pomocné pole, ne přísný formát)", () => {
    const result = validateCreateLeadInput(baseInput({ ico: "1193" }));
    expect(result.ok).toBe(true);
  });
});

describe("validateStageInput — Security Phase 16", () => {
  it("platný stav projde", () => {
    expect(validateStageInput("negotiating")).toEqual({ ok: true, value: "negotiating" });
  });

  it("neplatný stav = DENY", () => {
    expect(validateStageInput("won").ok).toBe(false);
  });
});

describe("validateCallLogInput — Security Phase 16", () => {
  // Security Phase 16.5 — dřív bylo úplně prázdné odeslání povolené ("jen
  // zápis kontaktu beze změny"), ale reálný test ukázal, že React po
  // úspěšném submitu formulář vyprázdní, takže opakované klepnutí na
  // "Uložit zápis" bez nového vyplnění dřív tiše vytvořilo prázdný
  // call_logged záznam. Teď se to odmítá už na validaci.
  it("úplně prázdné odeslání je DENY (UX past po vyprázdnění formuláře)", () => {
    const result = validateCallLogInput({ note: "", nextStage: "", nextFollowUpAt: "", nextStepNote: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/prázdný/i);
    }
  });

  it("jen poznámka bez čehokoliv dalšího je povolené", () => {
    expect(
      validateCallLogInput({ note: "Chce vzorek.", nextStage: "", nextFollowUpAt: "", nextStepNote: "" }).ok
    ).toBe(true);
  });

  it("jen posun fáze bez poznámky je povolené", () => {
    expect(
      validateCallLogInput({ note: "", nextStage: "sample_offer", nextFollowUpAt: "", nextStepNote: "" }).ok
    ).toBe(true);
  });

  it("jen datum dalšího kontaktu bez čehokoliv dalšího je povolené", () => {
    expect(
      validateCallLogInput({ note: "", nextStage: "", nextFollowUpAt: "2026-10-05", nextStepNote: "" }).ok
    ).toBe(true);
  });

  it("jen další krok bez čehokoliv dalšího je povolené", () => {
    expect(
      validateCallLogInput({ note: "", nextStage: "", nextFollowUpAt: "", nextStepNote: "Zavolat zítra." }).ok
    ).toBe(true);
  });

  it("jen bílé znaky ve všech polích se počítá jako prázdné = DENY", () => {
    expect(
      validateCallLogInput({ note: "   ", nextStage: "", nextFollowUpAt: "", nextStepNote: "  " }).ok
    ).toBe(false);
  });

  it("platný vstup s posunem fáze a follow-upem projde", () => {
    const result = validateCallLogInput({
      note: "Chce vzorek svařáku.",
      nextStage: "sample_offer",
      nextFollowUpAt: "2026-10-05",
      nextStepNote: "Poslat vzorek a zavolat.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextStage).toBe("sample_offer");
      expect(result.value.nextFollowUpAt?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    }
  });

  it("neplatná příští fáze = DENY", () => {
    expect(validateCallLogInput({ note: "", nextStage: "won", nextFollowUpAt: "", nextStepNote: "" }).ok).toBe(
      false
    );
  });

  it("neplatné datum follow-upu = DENY", () => {
    expect(
      validateCallLogInput({ note: "", nextStage: "", nextFollowUpAt: "zítra", nextStepNote: "" }).ok
    ).toBe(false);
  });

  it("příliš dlouhá poznámka = DENY", () => {
    expect(
      validateCallLogInput({ note: "a".repeat(2001), nextStage: "", nextFollowUpAt: "", nextStepNote: "" }).ok
    ).toBe(false);
  });
});

describe("validateCompanyNameInput — Security Phase 16.1", () => {
  it("platný název projde a ořízne mezery", () => {
    expect(validateCompanyNameInput("  Kavárna U Nádraží  ")).toEqual({
      ok: true,
      value: "Kavárna U Nádraží",
    });
  });

  it("prázdný vstup je povolený (smaže zpátky na neznámé)", () => {
    expect(validateCompanyNameInput("   ")).toEqual({ ok: true, value: null });
  });

  it("příliš dlouhý název = DENY", () => {
    expect(validateCompanyNameInput("a".repeat(201)).ok).toBe(false);
  });
});

describe("leadDisplayName — Security Phase 16.1", () => {
  it("companyName má nejvyšší prioritu", () => {
    expect(
      leadDisplayName({
        companyName: "Kavárna U Nádraží",
        contactName: "Jana Nová",
        contactEmail: "jana@example.com",
        contactPhone: "+420111222333",
      })
    ).toBe("Kavárna U Nádraží");
  });

  it("bez companyName spadne na contactName", () => {
    expect(
      leadDisplayName({
        companyName: null,
        contactName: "Jana Nová",
        contactEmail: "jana@example.com",
        contactPhone: "+420111222333",
      })
    ).toBe("Jana Nová");
  });

  it("bez companyName a contactName spadne na e-mail", () => {
    expect(
      leadDisplayName({ companyName: null, contactName: null, contactEmail: "jana@example.com", contactPhone: "+420111222333" })
    ).toBe("jana@example.com");
  });

  it("jen telefon spadne na telefon", () => {
    expect(
      leadDisplayName({ companyName: null, contactName: null, contactEmail: null, contactPhone: "+420111222333" })
    ).toBe("+420111222333");
  });

  it("úplně bez údajů vrátí zástupný text", () => {
    expect(leadDisplayName({ companyName: null, contactName: null, contactEmail: null, contactPhone: null })).toBe(
      "Neznámý kontakt"
    );
  });
});

describe("isFollowUpOverdue — Security Phase 16", () => {
  it("aktivní fáze + follow-up v minulosti = po termínu", () => {
    expect(isFollowUpOverdue("contacted", new Date("2020-01-01"))).toBe(true);
  });

  it("aktivní fáze + follow-up v budoucnosti = není po termínu", () => {
    expect(isFollowUpOverdue("contacted", new Date("2099-01-01"))).toBe(false);
  });

  it("bez follow-upu = není po termínu (nelze spočítat)", () => {
    expect(isFollowUpOverdue("contacted", null)).toBe(false);
  });

  it("converted lead se nikdy nepočítá jako po termínu", () => {
    expect(isFollowUpOverdue("converted", new Date("2020-01-01"))).toBe(false);
  });

  it("not_interested lead se nikdy nepočítá jako po termínu", () => {
    expect(isFollowUpOverdue("not_interested", new Date("2020-01-01"))).toBe(false);
  });
});

function sortRow(overrides: Partial<LeadSortRow> = {}): LeadSortRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    stage: "contacted",
    nextFollowUpAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// Security Phase 16.4 — regrese na nedeterministické řazení nahlášené na
// reálném leadu (Josef Huňáček): leady bez nextFollowUpAt (většina reálných
// dat) neměly žádný stabilní tiebreak, takže je UPDATE řádku (např. zápis
// hovoru) mohl v seznamu "přesunout" na náhodné místo.
describe("compareLeadsForList — Security Phase 16.4", () => {
  it("po termínu je vždy první, i před leadem s bližším budoucím follow-upem", () => {
    const overdue = sortRow({ id: "a", nextFollowUpAt: new Date("2020-01-01") });
    const future = sortRow({ id: "b", nextFollowUpAt: new Date("2026-01-02") });
    expect(compareLeadsForList(overdue, future)).toBeLessThan(0);
    expect(compareLeadsForList(future, overdue)).toBeGreaterThan(0);
  });

  it("mezi dvěma leady s follow-upem vyhrává bližší termín", () => {
    const sooner = sortRow({ id: "a", nextFollowUpAt: new Date("2026-02-01") });
    const later = sortRow({ id: "b", nextFollowUpAt: new Date("2026-03-01") });
    expect(compareLeadsForList(sooner, later)).toBeLessThan(0);
  });

  it("lead s nextFollowUpAt je vždy před leadem bez něj", () => {
    const withFollowUp = sortRow({ id: "a", nextFollowUpAt: new Date("2026-03-01") });
    const withoutFollowUp = sortRow({ id: "b", nextFollowUpAt: null });
    expect(compareLeadsForList(withFollowUp, withoutFollowUp)).toBeLessThan(0);
  });

  it("dva leady beze follow-upu se řadí podle createdAt (dřívější první) — stabilní, ne náhodné", () => {
    const older = sortRow({ id: "a", createdAt: new Date("2026-01-01") });
    const newer = sortRow({ id: "b", createdAt: new Date("2026-06-01") });
    expect(compareLeadsForList(older, newer)).toBeLessThan(0);
    expect(compareLeadsForList(newer, older)).toBeGreaterThan(0);
  });

  it("při shodném createdAt rozhoduje id jako definitivní tiebreak", () => {
    const sameCreatedAt = new Date("2026-01-01T00:00:00Z");
    const rowA = sortRow({ id: "aaaa", createdAt: sameCreatedAt });
    const rowB = sortRow({ id: "bbbb", createdAt: sameCreatedAt });
    expect(compareLeadsForList(rowA, rowB)).toBeLessThan(0);
    expect(compareLeadsForList(rowB, rowA)).toBeGreaterThan(0);
  });

  it("samotný zápis hovoru beze změny nextFollowUpAt nesmí změnit pořadí: lead s null nextFollowUpAt zůstává na stejné pozici mezi ostatními po 'update' (nová instance se stejnými daty vrací shodný výsledek řazení)", () => {
    const untouched = sortRow({ id: "a", createdAt: new Date("2026-01-01") });
    // Simulace: lead byl "aktualizován" (nová reference objektu, jako po
    // znovunačtení z DB po UPDATE), ale stage/nextFollowUpAt/createdAt/id
    // se nezměnily — call_logged bez posunu fáze a bez nextFollowUpAt.
    const afterCallLog = sortRow({ id: "a", createdAt: new Date("2026-01-01") });
    const other = sortRow({ id: "b", createdAt: new Date("2026-02-01") });

    const before = [untouched, other].sort(compareLeadsForList).map((r) => r.id);
    const after = [afterCallLog, other].sort(compareLeadsForList).map((r) => r.id);
    expect(after).toEqual(before);
  });

  it("řazení pole je stabilní a deterministické i při opakovaném volání na stejná data", () => {
    const rows: LeadSortRow[] = [
      sortRow({ id: "c", createdAt: new Date("2026-03-01") }),
      sortRow({ id: "a", createdAt: new Date("2026-01-01") }),
      sortRow({ id: "b", nextFollowUpAt: new Date("2020-01-01") }),
      sortRow({ id: "d", createdAt: new Date("2026-02-01") }),
    ];
    const firstRun = [...rows].sort(compareLeadsForList).map((r) => r.id);
    const secondRun = [...rows].sort(compareLeadsForList).map((r) => r.id);
    expect(secondRun).toEqual(firstRun);
    expect(firstRun).toEqual(["b", "a", "d", "c"]);
  });
});
