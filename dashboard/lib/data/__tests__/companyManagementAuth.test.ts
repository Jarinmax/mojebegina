// Security Phase 10 (Řízení firmy 1.0) — testy requireCompanyManagementAccess.
// Stejný vzor jako adminAuth.test.ts — syntetická data, žádná DB.
import { describe, expect, it } from "vitest";
import { requireCompanyManagementAccess } from "../companyManagementAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext } from "../types";

const admin: AuthContext = {
  userId: "user-admin",
  systemRole: "ADMIN",
  grantedRoles: ["ADMIN"],
  roleSelectionRequired: false,
  name: "Test Admin",
  email: "admin@example.test",
};
const executive: AuthContext = {
  userId: "user-exec",
  systemRole: "EXECUTIVE",
  grantedRoles: ["EXECUTIVE"],
  roleSelectionRequired: false,
  name: "Test Executive",
  email: "executive@example.test",
};
const customer: AuthContext = {
  userId: "user-customer",
  systemRole: "CUSTOMER",
  grantedRoles: ["CUSTOMER"],
  roleSelectionRequired: false,
  name: "Test Customer",
  email: "customer@example.test",
};
const employee: AuthContext = {
  userId: "user-employee",
  systemRole: "EMPLOYEE",
  grantedRoles: ["EMPLOYEE"],
  roleSelectionRequired: false,
  name: "Test Employee",
  email: "employee@example.test",
};

describe("requireCompanyManagementAccess — Security Phase 10 (Řízení firmy 1.0)", () => {
  it("ADMIN = ALLOW", () => {
    expect(requireCompanyManagementAccess(admin)).toEqual(admin);
  });

  it("EXECUTIVE = ALLOW", () => {
    expect(requireCompanyManagementAccess(executive)).toEqual(executive);
  });

  it("CUSTOMER = DENY", () => {
    expect(() => requireCompanyManagementAccess(customer)).toThrow(ForbiddenError);
  });

  it("EMPLOYEE = DENY", () => {
    expect(() => requireCompanyManagementAccess(employee)).toThrow(ForbiddenError);
  });

  it("nepřihlášený = DENY (Unauthenticated)", () => {
    expect(() => requireCompanyManagementAccess(null)).toThrow(UnauthenticatedError);
  });
});
