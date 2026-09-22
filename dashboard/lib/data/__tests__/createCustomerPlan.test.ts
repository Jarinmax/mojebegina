// Security Phase 13 — testy rozhodovací logiky opravující mezeru v ADMIN
// flow "Nový zákazník" (viz createCustomerPlan.ts). Pět scénářů odpovídá
// přesně zadání.
import { describe, expect, it } from "vitest";
import { planCustomerCreation } from "../createCustomerPlan";

describe("planCustomerCreation — Security Phase 13", () => {
  it("1. úplně nový e-mail (žádná existující identita) → založit nový Auth účet", () => {
    expect(planCustomerCreation(null)).toEqual({ mode: "new_user" });
  });

  it("2. existující aktivní Auth identita bez CUSTOMER role → znovupoužít, přidat CUSTOMER roli", () => {
    const plan = planCustomerCreation({ id: "user-lucie", hasCustomerRole: false });
    expect(plan).toEqual({ mode: "reuse_user", userId: "user-lucie", grantCustomerRole: true });
  });

  it("3. existující identita s jinou systemRole (např. EXECUTIVE) → stejně znovupoužít + přidat CUSTOMER, cizí role nejsou vstupem plánu, tedy nikdy nemizí", () => {
    // Plán se o cizí role (EXECUTIVE/ADMIN/EMPLOYEE) vůbec nezajímá — jen
    // o to, jestli CUSTOMER řádek už existuje. Exekuční vrstva do
    // user_roles jen PŘIDÁVÁ řádek, nikdy nemaže ani neupravuje existující
    // — plán proto nemá (a nesmí mít) způsob, jak jinou roli odebrat.
    const plan = planCustomerCreation({ id: "user-lucie", hasCustomerRole: false });
    expect(plan.mode).toBe("reuse_user");
    if (plan.mode === "reuse_user") {
      expect(plan.grantCustomerRole).toBe(true);
    }
  });

  it("4. uživatel, který už vlastní jinou organizaci (CUSTOMER roli už má) → znovupoužít, CUSTOMER roli znovu nepřidávat", () => {
    const plan = planCustomerCreation({ id: "user-existing-owner", hasCustomerRole: true });
    expect(plan).toEqual({
      mode: "reuse_user",
      userId: "user-existing-owner",
      grantCustomerRole: false,
    });
  });

  it("5. zabránění duplicitnímu/nekonzistentnímu stavu: reuse_user plán nikdy nenavrhuje založení nového Auth účtu a je deterministický (stejný vstup = stejný výstup)", () => {
    const input = { id: "user-x", hasCustomerRole: true };
    const planA = planCustomerCreation(input);
    const planB = planCustomerCreation(input);
    expect(planA).toEqual(planB);
    expect(planA.mode).not.toBe("new_user");
  });
});
