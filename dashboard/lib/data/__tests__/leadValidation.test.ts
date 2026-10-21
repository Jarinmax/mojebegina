import { describe, expect, it } from "vitest";
import {
  validateCreateLeadInput,
  validateStageInput,
  validateCallOutcomeInput,
  validateCompanyNameInput,
  validateContactEmailInput,
  isFollowUpOverdue,
  leadDisplayName,
  compareLeadsForList,
  type CreateLeadInput,
  type CallOutcomeInput,
  type LeadSortRow,
} from "../leadValidation";

function baseOutcome(overrides: Partial<CallOutcomeInput> = {}): CallOutcomeInput {
  return {
    result: "reached_interested",
    note: "Mluvili jsme, pošlu vzorek.",
    nextStage: "",
    nextFollowUpAt: "",
    nextStepNote: "",
    ...overrides,
  };
}

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

// Jarda – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis výsledku
// hovoru") — JEDINÁ validace pro "Dnešní volání" (dailyCalls.ts:
// logDailyCallOutcome) i "Všechny leady"/detail leadu (leads.ts:
// logCallOutcome). Dřív dvě nezávislé kopie: validateCallLogInput tady
// (výsledek vůbec nesbírala, všechna pole nepovinná) a
// validateDailyCallOutcomeInput v dailyCallsValidation.ts (výsledek+
// poznámka povinné). Teď JEDNO pravidlo, otestované jednou, pro obě
// obrazovky.
describe("validateCallOutcomeInput — Jarda – volání a provize, část 1", () => {
  it("platný vstup s výsledkem a poznámkou projde, fáze/datum/další krok zůstávají null", () => {
    const result = validateCallOutcomeInput(baseOutcome());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("reached_interested");
      expect(result.value.nextStage).toBeNull();
      expect(result.value.nextFollowUpAt).toBeNull();
      expect(result.value.nextStepNote).toBeNull();
    }
  });

  it("chybějící výsledek je DENY (stejné pravidlo na obou obrazovkách)", () => {
    expect(validateCallOutcomeInput(baseOutcome({ result: "" })).ok).toBe(false);
  });

  it("neplatný výsledek je DENY (žádné 'beze změny' u výsledku)", () => {
    expect(validateCallOutcomeInput(baseOutcome({ result: "beze_zmeny" })).ok).toBe(false);
  });

  // Security Phase 16.5 — dřív (CallLogInput) bylo úplně prázdné odeslání
  // povolené, pak se chránilo jen "aspoň jedno pole" pravidlem. Sjednocení
  // s "Dnešním voláním" to zpřísňuje na "poznámka vždy povinná" — reálný
  // test ukázal, že React po úspěšném submitu formulář vyprázdní, takže
  // opakované klepnutí na "Uložit" bez nového vyplnění by jinak tiše
  // vytvořilo prázdný call_logged záznam.
  it("chybějící poznámka je DENY, i když je výsledek vyplněný", () => {
    const result = validateCallOutcomeInput(baseOutcome({ note: "   " }));
    expect(result.ok).toBe(false);
  });

  it("volitelná fáze — platná hodnota projde a uloží se", () => {
    const result = validateCallOutcomeInput(baseOutcome({ nextStage: "sample_offer" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextStage).toBe("sample_offer");
    }
  });

  it("neplatná fáze = DENY", () => {
    expect(validateCallOutcomeInput(baseOutcome({ nextStage: "won" })).ok).toBe(false);
  });

  it("volitelný další krok — platná hodnota projde a uloží se", () => {
    const result = validateCallOutcomeInput(baseOutcome({ nextStepNote: "Poslat vzorek a zavolat." }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextStepNote).toBe("Poslat vzorek a zavolat.");
    }
  });

  it("příliš dlouhý další krok = DENY", () => {
    expect(validateCallOutcomeInput(baseOutcome({ nextStepNote: "a".repeat(501) })).ok).toBe(false);
  });

  it("výsledek 'call_back_later' BEZ data je DENY", () => {
    const result = validateCallOutcomeInput(baseOutcome({ result: "call_back_later", nextFollowUpAt: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Zavolat později/);
    }
  });

  it("výsledek 'call_back_later' S datem projde", () => {
    const result = validateCallOutcomeInput(
      baseOutcome({ result: "call_back_later", nextFollowUpAt: "2026-10-05" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextFollowUpAt?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    }
  });

  it("jiný výsledek než 'call_back_later' nevyžaduje datum", () => {
    expect(validateCallOutcomeInput(baseOutcome({ result: "no_answer", nextFollowUpAt: "" })).ok).toBe(true);
  });

  it("neplatné datum follow-upu = DENY", () => {
    expect(validateCallOutcomeInput(baseOutcome({ nextFollowUpAt: "zítra" })).ok).toBe(false);
  });

  it("platný vstup s posunem fáze, follow-upem i dalším krokem projde", () => {
    const result = validateCallOutcomeInput(
      baseOutcome({
        note: "Chce vzorek svařáku.",
        nextStage: "sample_offer",
        nextFollowUpAt: "2026-10-05",
        nextStepNote: "Poslat vzorek a zavolat.",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextStage).toBe("sample_offer");
      expect(result.value.nextFollowUpAt?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
      expect(result.value.nextStepNote).toBe("Poslat vzorek a zavolat.");
    }
  });

  it("příliš dlouhá poznámka = DENY", () => {
    expect(validateCallOutcomeInput(baseOutcome({ note: "a".repeat(2001) })).ok).toBe(false);
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

// Jarda – volání a provize, část 1, bod 1 — povinné testy 3+4
// ("platný e-mail lze uložit", "neplatný e-mail se neuloží"). Na rozdíl od
// validateCompanyNameInput je tohle výhradně "přidat" tok — prázdný vstup
// je DENY, ne povolené smazání.
describe("validateContactEmailInput — Jarda – volání a provize, část 1", () => {
  it("platný e-mail projde a ořízne mezery", () => {
    expect(validateContactEmailInput("  jana@ukotvy.cz  ")).toEqual({ ok: true, value: "jana@ukotvy.cz" });
  });

  it("prázdný vstup je DENY (tohle je 'přidat', ne 'smazat zpátky na neznámé')", () => {
    expect(validateContactEmailInput("   ").ok).toBe(false);
  });

  it("chybějící @ je DENY", () => {
    expect(validateContactEmailInput("janaukotvy.cz").ok).toBe(false);
  });

  it("chybějící doména/tečka je DENY", () => {
    expect(validateContactEmailInput("jana@ukotvy").ok).toBe(false);
  });

  it("mezera uvnitř adresy je DENY", () => {
    expect(validateContactEmailInput("jana @ukotvy.cz").ok).toBe(false);
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
