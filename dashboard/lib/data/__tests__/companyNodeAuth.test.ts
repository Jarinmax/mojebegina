import { describe, expect, it } from "vitest";
import { requireCompanyNodeAccess } from "../companyNodeAuth";
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

describe("requireCompanyNodeAccess — Security Phase 12", () => {
  it("ADMIN projde", () => {
    expect(requireCompanyNodeAccess(ctxWith("ADMIN"))).toEqual(ctxWith("ADMIN"));
  });

  it("EXECUTIVE projde", () => {
    expect(requireCompanyNodeAccess(ctxWith("EXECUTIVE"))).toEqual(ctxWith("EXECUTIVE"));
  });

  it("CUSTOMER = ForbiddenError (MVP: žádné jiné role)", () => {
    expect(() => requireCompanyNodeAccess(ctxWith("CUSTOMER"))).toThrow(ForbiddenError);
  });

  it("EMPLOYEE = ForbiddenError (MVP: mimo, schváleno explicitně)", () => {
    expect(() => requireCompanyNodeAccess(ctxWith("EMPLOYEE"))).toThrow(ForbiddenError);
  });

  it("nepřihlášený = UnauthenticatedError", () => {
    expect(() => requireCompanyNodeAccess(null)).toThrow(UnauthenticatedError);
  });
});
