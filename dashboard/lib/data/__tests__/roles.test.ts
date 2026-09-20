// Security Phase 9 — testy defaultPathForRole (kam po přihlášení/přepnutí
// role appka pošle uživatele — zadání, bod 8).
import { describe, expect, it } from "vitest";
import { defaultPathForRole, ROLE_LABELS } from "../roles";

describe("defaultPathForRole", () => {
  it("ADMIN → /admin", () => {
    expect(defaultPathForRole("ADMIN")).toBe("/admin");
  });

  it("EXECUTIVE → /executive", () => {
    expect(defaultPathForRole("EXECUTIVE")).toBe("/executive");
  });

  it("CUSTOMER → / (zákaznický dashboard)", () => {
    expect(defaultPathForRole("CUSTOMER")).toBe("/");
  });

  it("EMPLOYEE → / (stejný rozsah jako CUSTOMER, viz lib/db/schema.ts)", () => {
    expect(defaultPathForRole("EMPLOYEE")).toBe("/");
  });
});

describe("ROLE_LABELS", () => {
  it("obsahuje popisek pro každou SystemRole", () => {
    expect(ROLE_LABELS.CUSTOMER).toBe("Zákaznický účet");
    expect(ROLE_LABELS.EXECUTIVE).toBe("Vedení Beginy");
    expect(ROLE_LABELS.ADMIN).toBeTruthy();
    expect(ROLE_LABELS.EMPLOYEE).toBeTruthy();
  });
});
