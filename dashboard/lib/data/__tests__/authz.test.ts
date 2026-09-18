// Security Phase 2.2 — bezpečnostní testy autorizační vrstvy.
// Používá syntetická testovací data (žádná reálná organizace, žádný
// skutečný zákazník — The Cup s.r.o. se tímto NEMIGRUJE).
import { describe, expect, it } from "vitest";
import { requireOrgAccess, type GetMembership } from "../authz";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext, Membership } from "../types";

// --- Syntetická data -------------------------------------------------

const ORG_A = "org-a";
const ORG_B = "org-b";

const customerA: AuthContext = {
  userId: "user-a",
  systemRole: "CUSTOMER",
  name: "Test Customer A",
  email: "customer-a@example.test",
};
const employeeA: AuthContext = {
  userId: "employee-a",
  systemRole: "EMPLOYEE",
  name: "Test Employee A",
  email: "employee-a@example.test",
};
const executive: AuthContext = {
  userId: "user-exec",
  systemRole: "EXECUTIVE",
  name: "Test Executive",
  email: "executive@example.test",
};
const admin: AuthContext = {
  userId: "user-admin",
  systemRole: "ADMIN",
  name: "Test Admin",
  email: "admin@example.test",
};

// Syntetický "membership" graf: user-a je jen v Org A, employee-a jen v Org A.
const membershipGraph: Record<string, Record<string, Membership>> = {
  "user-a": { [ORG_A]: { role: "owner" } },
  "employee-a": { [ORG_A]: { role: "member" } },
};

const fakeGetMembership: GetMembership = async (userId, organizationId) => {
  return membershipGraph[userId]?.[organizationId] ?? null;
};

// --- Požadované scénáře ------------------------------------------------

describe("requireOrgAccess — Security Phase 2.2", () => {
  it("CUSTOMER A → Org A = ALLOW", async () => {
    await expect(
      requireOrgAccess(customerA, ORG_A, "read", fakeGetMembership)
    ).resolves.toEqual({ userId: "user-a", organizationId: ORG_A });

    await expect(
      requireOrgAccess(customerA, ORG_A, "write", fakeGetMembership)
    ).resolves.toEqual({ userId: "user-a", organizationId: ORG_A });
  });

  it("CUSTOMER A → Org B = DENY", async () => {
    await expect(
      requireOrgAccess(customerA, ORG_B, "read", fakeGetMembership)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("manipulace organizationId v požadavku = DENY", async () => {
    // Útočník přihlášený jako user-a (člen jen Org A) změní organizationId
    // v URL/body na Org B. Server o tom neví nic jiného než ověřenou
    // identitu (customerA) — organizationId z requestu je jen "co chceš
    // vidět", ne "na co máš právo".
    const requestedOrganizationIdFromClient = ORG_B;

    await expect(
      requireOrgAccess(customerA, requestedOrganizationIdFromClient, "read", fakeGetMembership)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("unauthenticated = DENY", async () => {
    await expect(
      requireOrgAccess(null, ORG_A, "read", fakeGetMembership)
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("EXECUTIVE → cizí zákaznická organizace = ALLOW READ", async () => {
    // Executive nemá žádné membership nikde, přesto smí číst Org A i Org B.
    await expect(
      requireOrgAccess(executive, ORG_A, "read", fakeGetMembership)
    ).resolves.toEqual({ userId: "user-exec", organizationId: ORG_A });

    await expect(
      requireOrgAccess(executive, ORG_B, "read", fakeGetMembership)
    ).resolves.toEqual({ userId: "user-exec", organizationId: ORG_B });
  });

  it("EXECUTIVE → cizí organizace, WRITE = DENY (jen read je povolené)", async () => {
    await expect(
      requireOrgAccess(executive, ORG_A, "write", fakeGetMembership)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("CUSTOMER → pokus eskalovat na EXECUTIVE/ADMIN = DENY", async () => {
    // Útočník je opravdu jen CUSTOMER (ověřeno server-side), ale do
    // requestu propašuje tvrzení, že je ADMIN. requireOrgAccess nemá
    // žádný parametr, kterým by šlo takové tvrzení předat — jediný zdroj
    // role je `ctx`, který v appce vzniká výhradně přes getAuthContext()
    // (server-side session + DB lookup), nikdy z těla requestu.
    const maliciousRequestPayload = {
      organizationId: ORG_B,
      claimedSystemRole: "ADMIN",
    };

    await expect(
      requireOrgAccess(
        customerA, // reálná, server-side ověřená identita — ne to, co tvrdí request
        maliciousRequestPayload.organizationId,
        "read",
        fakeGetMembership
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// --- Doplňkové testy (nejsou v zadání, ale ověřují okolní chování) -----

describe("requireOrgAccess — doplňkové testy", () => {
  it("ADMIN → jakákoli organizace, READ i WRITE = ALLOW", async () => {
    await expect(
      requireOrgAccess(admin, ORG_A, "read", fakeGetMembership)
    ).resolves.toBeDefined();
    await expect(
      requireOrgAccess(admin, ORG_B, "write", fakeGetMembership)
    ).resolves.toBeDefined();
  });

  it("EMPLOYEE se chová jako CUSTOMER (bezpečný default, dokud nejsou navržena přesná oprávnění)", async () => {
    await expect(
      requireOrgAccess(employeeA, ORG_A, "read", fakeGetMembership)
    ).resolves.toBeDefined();
    await expect(
      requireOrgAccess(employeeA, ORG_B, "read", fakeGetMembership)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("neexistující organizace = DENY i pro members jiné organizace", async () => {
    await expect(
      requireOrgAccess(customerA, "org-neexistuje", "read", fakeGetMembership)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
