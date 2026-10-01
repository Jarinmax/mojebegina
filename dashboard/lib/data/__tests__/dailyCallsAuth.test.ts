// Security Phase 19 (Denní volání 1.0) — oprávnění podle KONKRÉTNÍ osoby
// (userId), role je jen doplňková podmínka (schváleno explicitně, revize
// návrhu bod 1). Klíčový regresní test: další ADMIN/EXECUTIVE mimo Vinera
// a Blahouta (např. Jiří Střelec) NESMÍ dostat přístup jen tím, že má
// stejnou roli.
import { describe, expect, it } from "vitest";
import {
  isDailyCallCurator,
  isDailyCallWorker,
  requireDailyCallCuratorAccess,
  requireDailyCallWorkerAccess,
} from "../dailyCallsAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext } from "../types";

const VINER_ID = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT_ID = "06240ac4-c050-47ea-998c-6c81389edf9f";
const STRELEC_ID = "some-other-executive-id";

function ctx(
  userId: string,
  systemRole: NonNullable<AuthContext>["systemRole"]
): NonNullable<AuthContext> {
  return { userId, systemRole, grantedRoles: [systemRole], roleSelectionRequired: false, name: "Test", email: "t@example.com" };
}

const viner = ctx(VINER_ID, "ADMIN");
const blahout = ctx(BLAHOUT_ID, "EXECUTIVE");
const strelecExecutive = ctx(STRELEC_ID, "EXECUTIVE");
const strelecAdmin = ctx(STRELEC_ID, "ADMIN");

describe("isDailyCallCurator — Security Phase 19", () => {
  it("Viner (ADMIN, v allowlistu) je kurátor", () => {
    expect(isDailyCallCurator(viner)).toBe(true);
  });

  it("Blahout (EXECUTIVE, v allowlistu, ale ne kurátor) NENÍ kurátor", () => {
    expect(isDailyCallCurator(blahout)).toBe(false);
  });

  it("jiný EXECUTIVE mimo allowlist (i s rolí) NENÍ kurátor", () => {
    expect(isDailyCallCurator(strelecExecutive)).toBe(false);
  });

  it("jiný ADMIN mimo allowlist NENÍ kurátor — role sama nestačí", () => {
    expect(isDailyCallCurator(strelecAdmin)).toBe(false);
  });

  it("nepřihlášený není kurátor", () => {
    expect(isDailyCallCurator(null)).toBe(false);
  });
});

describe("isDailyCallWorker — Security Phase 19", () => {
  it("Viner i Blahout jsou pracovníci", () => {
    expect(isDailyCallWorker(viner)).toBe(true);
    expect(isDailyCallWorker(blahout)).toBe(true);
  });

  it("jiný ADMIN/EXECUTIVE mimo allowlist NENÍ pracovník, i se správnou rolí", () => {
    expect(isDailyCallWorker(strelecExecutive)).toBe(false);
    expect(isDailyCallWorker(strelecAdmin)).toBe(false);
  });

  it("CUSTOMER/EMPLOYEE i kdyby měli Vinerovo userId nejsou pracovníci bez odpovídající role", () => {
    expect(isDailyCallWorker(ctx(VINER_ID, "CUSTOMER"))).toBe(false);
    expect(isDailyCallWorker(ctx(BLAHOUT_ID, "EMPLOYEE"))).toBe(false);
  });
});

describe("requireDailyCallCuratorAccess / requireDailyCallWorkerAccess — Security Phase 19", () => {
  it("curator access: Viner projde, Blahout ForbiddenError, nepřihlášený UnauthenticatedError", () => {
    expect(requireDailyCallCuratorAccess(viner)).toEqual(viner);
    expect(() => requireDailyCallCuratorAccess(blahout)).toThrow(ForbiddenError);
    expect(() => requireDailyCallCuratorAccess(null)).toThrow(UnauthenticatedError);
  });

  it("worker access: Viner i Blahout projdou, Střelec (EXECUTIVE) ForbiddenError", () => {
    expect(requireDailyCallWorkerAccess(viner)).toEqual(viner);
    expect(requireDailyCallWorkerAccess(blahout)).toEqual(blahout);
    expect(() => requireDailyCallWorkerAccess(strelecExecutive)).toThrow(ForbiddenError);
  });
});
