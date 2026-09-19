// Security Phase 1.1B — testy autorizačního jádra Begina Adminu.
// Syntetická data, žádná reálná organizace ani zákazník.
import { describe, expect, it } from "vitest";
import { requireAdmin } from "../adminAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext } from "../types";

const admin: AuthContext = {
  userId: "user-admin",
  systemRole: "ADMIN",
  name: "Test Admin",
  email: "admin@example.test",
};
const customer: AuthContext = {
  userId: "user-customer",
  systemRole: "CUSTOMER",
  name: "Test Customer",
  email: "customer@example.test",
};
const executive: AuthContext = {
  userId: "user-exec",
  systemRole: "EXECUTIVE",
  name: "Test Executive",
  email: "executive@example.test",
};
const employee: AuthContext = {
  userId: "user-employee",
  systemRole: "EMPLOYEE",
  name: "Test Employee",
  email: "employee@example.test",
};

describe("requireAdmin — Security Phase 1.1B", () => {
  it("ADMIN = ALLOW", () => {
    expect(requireAdmin(admin)).toEqual(admin);
  });

  it("nepřihlášený = DENY (Unauthenticated)", () => {
    expect(() => requireAdmin(null)).toThrow(UnauthenticatedError);
  });

  it("CUSTOMER = DENY (Forbidden), i když je přihlášený", () => {
    expect(() => requireAdmin(customer)).toThrow(ForbiddenError);
  });

  it("EXECUTIVE = DENY — cross-org READ není totéž co admin přístup", () => {
    expect(() => requireAdmin(executive)).toThrow(ForbiddenError);
  });

  it("EMPLOYEE = DENY", () => {
    expect(() => requireAdmin(employee)).toThrow(ForbiddenError);
  });
});
