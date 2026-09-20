// Security Phase 5 — testy čisté validace vstupu pro založení zákazníka.
// Syntetická data, žádná reálná organizace ani zákazník, žádné I/O.
import { describe, expect, it } from "vitest";
import { validateCreateCustomerInput } from "../createCustomerValidation";

const validInput = {
  name: "The Cup s.r.o.",
  ico: "11935367",
  registeredAddress: "Náměstí 1, 110 00 Praha 1",
  contactName: "Veronika Dušková",
  contactEmail: "razitko-kavarna@seznam.cz",
};

describe("validateCreateCustomerInput — Security Phase 5", () => {
  it("platný vstup = ALLOW, hodnoty jsou trimnuté", () => {
    const result = validateCreateCustomerInput({
      ...validInput,
      name: "  The Cup s.r.o.  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("The Cup s.r.o.");
    }
  });

  it("prázdný název firmy = DENY", () => {
    const result = validateCreateCustomerInput({ ...validInput, name: "   " });
    expect(result.ok).toBe(false);
  });

  it("IČO musí mít přesně 8 číslic", () => {
    expect(validateCreateCustomerInput({ ...validInput, ico: "123" }).ok).toBe(false);
    expect(validateCreateCustomerInput({ ...validInput, ico: "123456789" }).ok).toBe(false);
    expect(validateCreateCustomerInput({ ...validInput, ico: "1234567a" }).ok).toBe(false);
    expect(validateCreateCustomerInput({ ...validInput, ico: "12345678" }).ok).toBe(true);
  });

  it("prázdná adresa sídla = DENY", () => {
    const result = validateCreateCustomerInput({ ...validInput, registeredAddress: "" });
    expect(result.ok).toBe(false);
  });

  it("prázdné jméno kontaktní osoby = DENY", () => {
    const result = validateCreateCustomerInput({ ...validInput, contactName: "  " });
    expect(result.ok).toBe(false);
  });

  it("neplatný e-mail = DENY", () => {
    expect(validateCreateCustomerInput({ ...validInput, contactEmail: "spatne" }).ok).toBe(false);
    expect(
      validateCreateCustomerInput({ ...validInput, contactEmail: "spatne@" }).ok
    ).toBe(false);
    expect(
      validateCreateCustomerInput({ ...validInput, contactEmail: "a@b.cz" }).ok
    ).toBe(true);
  });
});
