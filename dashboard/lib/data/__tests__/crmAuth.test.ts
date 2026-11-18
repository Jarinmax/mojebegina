import { describe, expect, it } from "vitest";
import { crmSeesAll, isSalesRep, requireCrmAccess, requireCrmManager } from "../crmAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext } from "../types";

function ctxWith(systemRole: AuthContext extends null ? never : NonNullable<AuthContext>["systemRole"]): NonNullable<AuthContext> {
  return {
    userId: "u1",
    systemRole,
    grantedRoles: [systemRole],
    roleSelectionRequired: false,
    name: "Test",
    email: "test@example.com",
  };
}

describe("requireCrmAccess — Security Phase 16", () => {
  it("ADMIN projde", () => {
    expect(requireCrmAccess(ctxWith("ADMIN"))).toEqual(ctxWith("ADMIN"));
  });

  it("EXECUTIVE projde", () => {
    expect(requireCrmAccess(ctxWith("EXECUTIVE"))).toEqual(ctxWith("EXECUTIVE"));
  });

  it("CUSTOMER = ForbiddenError (MVP: žádné jiné role)", () => {
    expect(() => requireCrmAccess(ctxWith("CUSTOMER"))).toThrow(ForbiddenError);
  });

  it("EMPLOYEE, který není obchodník = ForbiddenError", () => {
    expect(() => requireCrmAccess(ctxWith("EMPLOYEE"))).toThrow(ForbiddenError);
  });

  it("nepřihlášený = UnauthenticatedError", () => {
    expect(() => requireCrmAccess(null)).toThrow(UnauthenticatedError);
  });
});

describe("obchodník (EMPLOYEE, 18. 11. 2026)", () => {
  const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
  const blahout = (systemRole: "EMPLOYEE" | "CUSTOMER"): NonNullable<AuthContext> => ({ ...ctxWith(systemRole), userId: BLAHOUT });

  it("Blahout jako EMPLOYEE do CRM smí, ale nevidí vše a není vedoucí", () => {
    expect(requireCrmAccess(blahout("EMPLOYEE")).userId).toBe(BLAHOUT);
    expect(isSalesRep(blahout("EMPLOYEE"))).toBe(true);
    expect(crmSeesAll(blahout("EMPLOYEE"))).toBe(false);
    expect(() => requireCrmManager(blahout("EMPLOYEE"))).toThrow(ForbiddenError);
  });

  it("Blahout jako CUSTOMER ani jiný EMPLOYEE do CRM nesmí", () => {
    expect(() => requireCrmAccess(blahout("CUSTOMER"))).toThrow(ForbiddenError);
    expect(isSalesRep(ctxWith("EMPLOYEE"))).toBe(false);
  });

  it("vedení vidí vše", () => {
    expect(crmSeesAll(ctxWith("ADMIN"))).toBe(true);
    expect(crmSeesAll(ctxWith("EXECUTIVE"))).toBe(true);
    expect(requireCrmManager(ctxWith("EXECUTIVE")).systemRole).toBe("EXECUTIVE");
  });
});
