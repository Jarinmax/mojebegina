// Security Phase 1.1B — testy autorizačního jádra Begina Adminu.
// Syntetická data, žádná reálná organizace ani zákazník.
import { describe, expect, it } from "vitest";
import {
  isAdmin,
  isAdminOrExecutive,
  isExecutive,
  requireAdmin,
  requireAdminOrExecutive,
} from "../adminAuth";
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
const customer: AuthContext = {
  userId: "user-customer",
  systemRole: "CUSTOMER",
  grantedRoles: ["CUSTOMER"],
  roleSelectionRequired: false,
  name: "Test Customer",
  email: "customer@example.test",
};
const executive: AuthContext = {
  userId: "user-exec",
  systemRole: "EXECUTIVE",
  grantedRoles: ["EXECUTIVE"],
  roleSelectionRequired: false,
  name: "Test Executive",
  email: "executive@example.test",
};
const employee: AuthContext = {
  userId: "user-employee",
  systemRole: "EMPLOYEE",
  grantedRoles: ["EMPLOYEE"],
  roleSelectionRequired: false,
  name: "Test Employee",
  email: "employee@example.test",
};
// Security Phase 9 — Jiří Střelec: jeden Neon Auth účet, dvě granted role.
// systemRole je AKTIVNÍ role pro daný request (viz lib/data/activeRole.ts)
// — isAdmin/isExecutive/isAdminOrExecutive se dívají jen na ni, nikdy na
// grantedRoles, takže "mít EXECUTIVE navíc" nesmí nijak rozšířit, co dovolí
// customerExecutiveAsCustomer níž.
const customerExecutiveAsCustomer: AuthContext = {
  userId: "user-multi",
  systemRole: "CUSTOMER",
  grantedRoles: ["CUSTOMER", "EXECUTIVE"],
  roleSelectionRequired: false,
  name: "Jiří Střelec",
  email: "jstrelec@example.test",
};
const customerExecutiveAsExecutive: AuthContext = {
  userId: "user-multi",
  systemRole: "EXECUTIVE",
  grantedRoles: ["CUSTOMER", "EXECUTIVE"],
  roleSelectionRequired: false,
  name: "Jiří Střelec",
  email: "jstrelec@example.test",
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

  it("EXECUTIVE = DENY na requireAdmin — žádná mutace (createCustomerOrganization, updateOrganization, addOrganizationMember, removeOrganizationMember, resendActivationLink) EXECUTIVE nedovolí, protože všechny volají requireAdminContext→requireAdmin, ne requireAdminOrExecutive", () => {
    expect(() => requireAdmin(executive)).toThrow(ForbiddenError);
  });
});

describe("requireAdminOrExecutive — Security Phase 7 (Executive 1.0)", () => {
  it("ADMIN = ALLOW", () => {
    expect(requireAdminOrExecutive(admin)).toEqual(admin);
  });

  it("EXECUTIVE = ALLOW — cross-org READ (listOrganizations, getOrganizationDetail)", () => {
    expect(requireAdminOrExecutive(executive)).toEqual(executive);
  });

  it("nepřihlášený = DENY (Unauthenticated)", () => {
    expect(() => requireAdminOrExecutive(null)).toThrow(UnauthenticatedError);
  });

  it("CUSTOMER = DENY", () => {
    expect(() => requireAdminOrExecutive(customer)).toThrow(ForbiddenError);
  });

  it("EMPLOYEE = DENY", () => {
    expect(() => requireAdminOrExecutive(employee)).toThrow(ForbiddenError);
  });
});

describe("isAdmin / isExecutive — čisté predikáty pro routing guardy", () => {
  it("isAdmin: true jen pro ADMIN — app/admin/layout.tsx by EXECUTIVE/CUSTOMER/EMPLOYEE/nepřihlášeného přesměroval", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(executive)).toBe(false);
    expect(isAdmin(customer)).toBe(false);
    expect(isAdmin(employee)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("isExecutive: true jen pro EXECUTIVE — app/executive/layout.tsx by ADMIN/CUSTOMER/EMPLOYEE/nepřihlášeného přesměroval", () => {
    expect(isExecutive(executive)).toBe(true);
    expect(isExecutive(admin)).toBe(false);
    expect(isExecutive(customer)).toBe(false);
    expect(isExecutive(employee)).toBe(false);
    expect(isExecutive(null)).toBe(false);
  });

  it("EXECUTIVE nesmí na /admin", () => {
    expect(isAdmin(executive)).toBe(false);
  });

  it("CUSTOMER nesmí na /executive", () => {
    expect(isExecutive(customer)).toBe(false);
  });
});

describe("isAdminOrExecutive — Security Phase 8 (Řízení firmy)", () => {
  it("ADMIN → Řízení firmy může zobrazit", () => {
    expect(isAdminOrExecutive(admin)).toBe(true);
  });

  it("EXECUTIVE → Řízení firmy může zobrazit", () => {
    expect(isAdminOrExecutive(executive)).toBe(true);
  });

  it("CUSTOMER → přístup zamítnut", () => {
    expect(isAdminOrExecutive(customer)).toBe(false);
  });

  it("EMPLOYEE → přístup zamítnut", () => {
    expect(isAdminOrExecutive(employee)).toBe(false);
  });

  it("nepřihlášený (anonymous) → přístup zamítnut", () => {
    expect(isAdminOrExecutive(null)).toBe(false);
  });
});

describe("Security Phase 9 — CUSTOMER + EXECUTIVE na jednom účtu (routing predikáty)", () => {
  it("aktivní role CUSTOMER (i s EXECUTIVE v grantedRoles) nemá přístup do /executive", () => {
    expect(isExecutive(customerExecutiveAsCustomer)).toBe(false);
  });

  it("aktivní role CUSTOMER nemá přístup do /admin", () => {
    expect(isAdmin(customerExecutiveAsCustomer)).toBe(false);
  });

  it("aktivní role EXECUTIVE nemá přístup do /admin", () => {
    expect(isAdmin(customerExecutiveAsExecutive)).toBe(false);
  });

  it("aktivní role EXECUTIVE má přístup do /executive", () => {
    expect(isExecutive(customerExecutiveAsExecutive)).toBe(true);
  });

  it("obě aktivní role mají přístup do Řízení firmy (ADMIN nebo EXECUTIVE)", () => {
    expect(isAdminOrExecutive(customerExecutiveAsExecutive)).toBe(true);
    expect(isAdminOrExecutive(customerExecutiveAsCustomer)).toBe(false);
  });
});
