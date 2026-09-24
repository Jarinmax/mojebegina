import { describe, expect, it } from "vitest";
import { requireOrderAccess } from "../orderAuth";
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

describe("requireOrderAccess — Security Phase 15", () => {
  it("ADMIN projde", () => {
    expect(requireOrderAccess(ctxWith("ADMIN"))).toEqual(ctxWith("ADMIN"));
  });

  it("EXECUTIVE projde", () => {
    expect(requireOrderAccess(ctxWith("EXECUTIVE"))).toEqual(ctxWith("EXECUTIVE"));
  });

  it("CUSTOMER = ForbiddenError (MVP: žádné jiné role)", () => {
    expect(() => requireOrderAccess(ctxWith("CUSTOMER"))).toThrow(ForbiddenError);
  });

  it("EMPLOYEE = ForbiddenError (MVP: mimo, stejně jako u company_nodes)", () => {
    expect(() => requireOrderAccess(ctxWith("EMPLOYEE"))).toThrow(ForbiddenError);
  });

  it("nepřihlášený = UnauthenticatedError", () => {
    expect(() => requireOrderAccess(null)).toThrow(UnauthenticatedError);
  });
});
