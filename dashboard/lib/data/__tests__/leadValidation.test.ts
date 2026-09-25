import { describe, expect, it } from "vitest";
import {
  validateCreateLeadInput,
  validateStageInput,
  validateCallLogInput,
  validateCompanyNameInput,
  isFollowUpOverdue,
  leadDisplayName,
  type CreateLeadInput,
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
  it("všechna pole prázdná je povolené (jen zápis kontaktu beze změny)", () => {
    const result = validateCallLogInput({ note: "", nextStage: "", nextFollowUpAt: "", nextStepNote: "" });
    expect(result).toEqual({
      ok: true,
      value: { note: null, nextStage: null, nextFollowUpAt: null, nextStepNote: null },
    });
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
