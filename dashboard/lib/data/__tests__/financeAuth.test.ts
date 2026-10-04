// Finance 1.0 — oprávnění podle konkrétní osoby (userId) + role. Klíčové
// regresní testy: další ADMIN/EXECUTIVE (Blahout, Střelec) NESMÍ vidět
// finance jen proto, že mají stejnou roli; Lucie jen čte.
import { describe, expect, it } from "vitest";
import {
  isFinanceManager,
  isFinanceReader,
  requireFinanceManageAccess,
  requireFinanceReadAccess,
} from "../financeAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext, SystemRole } from "../types";

const VINER_ID = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE_ID = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const BLAHOUT_ID = "06240ac4-c050-47ea-998c-6c81389edf9f";
const STRELEC_ID = "fdc7b836-2325-4568-b9b7-5ac579cd8972";

function ctx(userId: string, systemRole: SystemRole, roleSelectionRequired = false): NonNullable<AuthContext> {
  return { userId, systemRole, grantedRoles: [systemRole], roleSelectionRequired, name: "Test", email: "t@example.com" };
}

describe("čtení financí", () => {
  it("Viner (ADMIN) a Lucie (EXECUTIVE) čtou", () => {
    expect(isFinanceReader(ctx(VINER_ID, "ADMIN"))).toBe(true);
    expect(isFinanceReader(ctx(LUCIE_ID, "EXECUTIVE"))).toBe(true);
  });

  it("Lucie v roli CUSTOMER finance nevidí", () => {
    expect(isFinanceReader(ctx(LUCIE_ID, "CUSTOMER"))).toBe(false);
  });

  it("Blahout a Střelec (EXECUTIVE) nevidí — role sama nestačí", () => {
    expect(isFinanceReader(ctx(BLAHOUT_ID, "EXECUTIVE"))).toBe(false);
    expect(isFinanceReader(ctx(STRELEC_ID, "EXECUTIVE"))).toBe(false);
    expect(isFinanceReader(ctx(STRELEC_ID, "ADMIN"))).toBe(false);
  });

  it("nepotvrzená aktivní role se k autorizaci nepoužije", () => {
    expect(isFinanceReader(ctx(VINER_ID, "ADMIN", true))).toBe(false);
  });

  it("nepřihlášený", () => {
    expect(isFinanceReader(null)).toBe(false);
    expect(() => requireFinanceReadAccess(null)).toThrow(UnauthenticatedError);
    expect(() => requireFinanceReadAccess(ctx(BLAHOUT_ID, "EXECUTIVE"))).toThrow(ForbiddenError);
  });
});

describe("nastavení a ruční synchronizace", () => {
  it("jen Viner s aktivní rolí ADMIN", () => {
    expect(isFinanceManager(ctx(VINER_ID, "ADMIN"))).toBe(true);
    expect(isFinanceManager(ctx(VINER_ID, "EXECUTIVE"))).toBe(false);
    expect(requireFinanceManageAccess(ctx(VINER_ID, "ADMIN")).userId).toBe(VINER_ID);
  });

  it("Lucie jen čte — synchronizaci ani nastavení nespustí", () => {
    expect(isFinanceManager(ctx(LUCIE_ID, "EXECUTIVE"))).toBe(false);
    expect(isFinanceManager(ctx(LUCIE_ID, "ADMIN"))).toBe(false);
    expect(() => requireFinanceManageAccess(ctx(LUCIE_ID, "EXECUTIVE"))).toThrow(ForbiddenError);
  });

  it("jiný ADMIN mimo seznam ne", () => {
    expect(isFinanceManager(ctx(STRELEC_ID, "ADMIN"))).toBe(false);
  });
});
