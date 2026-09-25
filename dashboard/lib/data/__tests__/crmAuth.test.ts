import { describe, expect, it } from "vitest";
import { requireCrmAccess } from "../crmAuth";
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

  it("EMPLOYEE = ForbiddenError (MVP: mimo, žádná SALES role zatím neexistuje)", () => {
    expect(() => requireCrmAccess(ctxWith("EMPLOYEE"))).toThrow(ForbiddenError);
  });

  it("nepřihlášený = UnauthenticatedError", () => {
    expect(() => requireCrmAccess(null)).toThrow(UnauthenticatedError);
  });
});
