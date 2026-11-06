// Security Phase 6 — testy čisté validace správy organizace. Syntetická
// data, žádná reálná organizace ani zákazník, žádné I/O.
import { describe, expect, it } from "vitest";
import {
  validateAddOrganizationLocationInput,
  validateAddMemberInput,
  validateUpdateOrganizationInput,
} from "../organizationAdminValidation";

describe("validateUpdateOrganizationInput — Security Phase 6", () => {
  const valid = {
    name: "The Cup s.r.o.",
    ico: "11935367",
    registeredAddress: "Prvního pluku 144/14, 186 00 Praha",
    status: "Zákazník Begina",
  };

  it("platný vstup = ALLOW, hodnoty jsou trimnuté", () => {
    const result = validateUpdateOrganizationInput({ ...valid, name: "  The Cup s.r.o.  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("The Cup s.r.o.");
  });

  it("prázdný status se uloží jako null", () => {
    const result = validateUpdateOrganizationInput({ ...valid, status: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBeNull();
  });

  it("prázdný název = DENY", () => {
    expect(validateUpdateOrganizationInput({ ...valid, name: " " }).ok).toBe(false);
  });

  it("IČO musí mít přesně 8 číslic (stejně jako při založení)", () => {
    expect(validateUpdateOrganizationInput({ ...valid, ico: "123" }).ok).toBe(false);
    expect(validateUpdateOrganizationInput({ ...valid, ico: "123456789" }).ok).toBe(false);
    expect(validateUpdateOrganizationInput({ ...valid, ico: "1234567a" }).ok).toBe(false);
    expect(validateUpdateOrganizationInput({ ...valid, ico: "12345678" }).ok).toBe(true);
  });

  it("prázdná adresa sídla = DENY", () => {
    expect(validateUpdateOrganizationInput({ ...valid, registeredAddress: "" }).ok).toBe(false);
  });
});

describe("validateAddMemberInput — Security Phase 6", () => {
  const valid = { name: "Nový Uživatel", email: "novy@example.com", role: "member" };

  it("platný vstup = ALLOW", () => {
    const result = validateAddMemberInput(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.role).toBe("member");
  });

  it("role owner projde", () => {
    const result = validateAddMemberInput({ ...valid, role: "owner" });
    expect(result.ok).toBe(true);
  });

  it("neplatná role = DENY", () => {
    expect(validateAddMemberInput({ ...valid, role: "superadmin" }).ok).toBe(false);
  });

  it("prázdné jméno = DENY", () => {
    expect(validateAddMemberInput({ ...valid, name: "  " }).ok).toBe(false);
  });

  it("neplatný e-mail = DENY", () => {
    expect(validateAddMemberInput({ ...valid, email: "spatne" }).ok).toBe(false);
  });
});

describe("validateAddOrganizationLocationInput", () => {
  const valid = {
    label: "Kavárna Nová hra",
    street: "Jeremenkova 1019/66",
    city: "Praha",
    zip: "147 00",
    contactName: "Paní Karabcová",
    contactPhone: "+420 603 437 734",
  };

  it("přijme a ořízne platnou provozovnu", () => {
    const result = validateAddOrganizationLocationInput({ ...valid, label: "  Kavárna Nová hra " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.label).toBe("Kavárna Nová hra");
  });

  it("vyžaduje název, ulici a město", () => {
    expect(validateAddOrganizationLocationInput({ ...valid, label: "" }).ok).toBe(false);
    expect(validateAddOrganizationLocationInput({ ...valid, street: "" }).ok).toBe(false);
    expect(validateAddOrganizationLocationInput({ ...valid, city: "" }).ok).toBe(false);
  });

  it("kontroluje české PSČ s mezerou i bez ní", () => {
    expect(validateAddOrganizationLocationInput({ ...valid, zip: "14700" }).ok).toBe(true);
    expect(validateAddOrganizationLocationInput({ ...valid, zip: "147 00" }).ok).toBe(true);
    expect(validateAddOrganizationLocationInput({ ...valid, zip: "147" }).ok).toBe(false);
  });
});
