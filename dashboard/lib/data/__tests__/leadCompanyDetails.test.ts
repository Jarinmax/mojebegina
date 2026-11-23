import { describe, expect, it } from "vitest";
import { validateLeadCompanyDetailsInput } from "../leadValidation";

describe("firma u leadu (název, IČO, sídlo)", () => {
  it("ořízne a prázdné uloží jako null", () => {
    expect(validateLeadCompanyDetailsInput({ companyName: "  Starý Chřestýš s.r.o. ", ico: "106 917 31", address: " " })).toEqual({
      ok: true,
      value: { companyName: "Starý Chřestýš s.r.o.", ico: "10691731", address: null },
    });
  });

  it("IČO musí mít 8 číslic, nebo být prázdné", () => {
    expect(validateLeadCompanyDetailsInput({ companyName: "", ico: "1234", address: "" }).ok).toBe(false);
    expect(validateLeadCompanyDetailsInput({ companyName: "", ico: "", address: "" })).toEqual({
      ok: true,
      value: { companyName: null, ico: null, address: null },
    });
  });

  it("odmítne příliš dlouhou adresu", () => {
    expect(validateLeadCompanyDetailsInput({ companyName: "A", ico: "", address: "x".repeat(301) }).ok).toBe(false);
  });
});
