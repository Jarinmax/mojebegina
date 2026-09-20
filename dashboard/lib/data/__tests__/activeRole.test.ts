// Security Phase 9 — testy čisté logiky výběru aktivní role
// (resolveActiveRole, isSystemRole). Žádné cookies()/DB volání — přesně
// proto je tahle logika vytažená z authContext.ts do samostatného souboru
// bez "server-only" (stejný vzor jako adminAuth.ts/organizationAdminValidation.ts).
import { describe, expect, it } from "vitest";
import { isSystemRole, resolveActiveRole } from "../activeRole";

describe("resolveActiveRole — jedna role (zadání, bod 2: chování jako dnes)", () => {
  it("CUSTOMER only → aktivní CUSTOMER, žádný výběr, bez ohledu na cookie", () => {
    expect(resolveActiveRole(["CUSTOMER"], undefined)).toEqual({
      systemRole: "CUSTOMER",
      roleSelectionRequired: false,
    });
    expect(resolveActiveRole(["CUSTOMER"], "EXECUTIVE")).toEqual({
      systemRole: "CUSTOMER",
      roleSelectionRequired: false,
    });
  });

  it("EXECUTIVE only → aktivní EXECUTIVE, žádný výběr", () => {
    expect(resolveActiveRole(["EXECUTIVE"], undefined)).toEqual({
      systemRole: "EXECUTIVE",
      roleSelectionRequired: false,
    });
  });

  it("ADMIN only → aktivní ADMIN, žádný výběr", () => {
    expect(resolveActiveRole(["ADMIN"], undefined)).toEqual({
      systemRole: "ADMIN",
      roleSelectionRequired: false,
    });
  });

  it("podvržená cookie ADMIN u uživatele bez ADMIN role → ignorována, DENY (zůstává jeho jediná skutečná role)", () => {
    expect(resolveActiveRole(["CUSTOMER"], "ADMIN")).toEqual({
      systemRole: "CUSTOMER",
      roleSelectionRequired: false,
    });
  });

  it("podvržená cookie EXECUTIVE u CUSTOMER-only uživatele → ignorována, DENY", () => {
    expect(resolveActiveRole(["CUSTOMER"], "EXECUTIVE")).toEqual({
      systemRole: "CUSTOMER",
      roleSelectionRequired: false,
    });
  });
});

describe("resolveActiveRole — CUSTOMER + EXECUTIVE (Jiří Střelec)", () => {
  const granted = ["CUSTOMER", "EXECUTIVE"] as const;

  it("platná cookie CUSTOMER → CUSTOMER lze aktivovat", () => {
    expect(resolveActiveRole([...granted], "CUSTOMER")).toEqual({
      systemRole: "CUSTOMER",
      roleSelectionRequired: false,
    });
  });

  it("platná cookie EXECUTIVE → EXECUTIVE lze aktivovat", () => {
    expect(resolveActiveRole([...granted], "EXECUTIVE")).toEqual({
      systemRole: "EXECUTIVE",
      roleSelectionRequired: false,
    });
  });

  it("žádná cookie → nutný výběr (roleSelectionRequired), nikdy tichý automatický výběr", () => {
    const result = resolveActiveRole([...granted], undefined);
    expect(result.roleSelectionRequired).toBe(true);
    expect(granted).toContain(result.systemRole);
  });

  it("cookie s rolí, kterou uživatel nemá (podvržená ADMIN) → zamítnuto, spadne na výběr", () => {
    const result = resolveActiveRole([...granted], "ADMIN");
    expect(result.roleSelectionRequired).toBe(true);
    expect(result.systemRole).not.toBe("ADMIN");
  });

  it("cookie s rolí, která byla uživateli mezitím odebrána (grantedRoles už ji neobsahuje) → zamítnuto/fallback", () => {
    // Cookie z doby, kdy měl ještě EXECUTIVE — role mu byla odebrána,
    // grantedRoles teď obsahuje jen CUSTOMER. Přesně tohle je scénář
    // "odebrání role" ze zadání, bod 6 — žádný speciální kód navíc není
    // potřeba, je to jen důsledek toho, že se grantedRoles vždy čte čerstvě.
    expect(resolveActiveRole(["CUSTOMER"], "EXECUTIVE")).toEqual({
      systemRole: "CUSTOMER",
      roleSelectionRequired: false,
    });
  });

  it("neznámý/nesmyslný text v cookie → ignorován jako neplatný", () => {
    const result = resolveActiveRole([...granted], "SUPERUSER");
    expect(result.roleSelectionRequired).toBe(true);
  });
});

describe("resolveActiveRole — okrajové vstupy", () => {
  it("prázdné grantedRoles je programátorská chyba, ne tichý fallback", () => {
    expect(() => resolveActiveRole([], undefined)).toThrow();
  });
});

describe("isSystemRole", () => {
  it("uznává jen skutečné role", () => {
    expect(isSystemRole("ADMIN")).toBe(true);
    expect(isSystemRole("EXECUTIVE")).toBe(true);
    expect(isSystemRole("CUSTOMER")).toBe(true);
    expect(isSystemRole("EMPLOYEE")).toBe(true);
  });

  it("odmítá neznámé/prázdné hodnoty", () => {
    expect(isSystemRole("SUPERUSER")).toBe(false);
    expect(isSystemRole("")).toBe(false);
    expect(isSystemRole(undefined)).toBe(false);
    expect(isSystemRole(null)).toBe(false);
  });
});
