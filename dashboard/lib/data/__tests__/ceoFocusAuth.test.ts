import { describe, expect, it } from "vitest";
import { isCeoFocusAllowed, requireCeoFocusAccess } from "../ceoFocusAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext } from "../types";

function ctxFor(email: string): AuthContext {
  return {
    userId: "u1",
    systemRole: "ADMIN",
    grantedRoles: ["ADMIN"],
    roleSelectionRequired: false,
    name: "Test User",
    email,
  };
}

// Security Phase 17 (CEO přehled 1.0) — na rozdíl od každé jiné brány v
// appce tahle NENÍ založená na roli, ale na allowlistu konkrétních lidí.
// Kriticky důležité ověřit, že EXECUTIVE, který dnes prochází
// isAdminOrExecutive (Blahout, Königsbergová), sem NESMÍ — to je celý
// smysl téhle samostatné brány.
describe("isCeoFocusAllowed — Security Phase 17", () => {
  it("Jaroslav Viner (e-mail) je povolen", () => {
    expect(isCeoFocusAllowed(ctxFor("viner.jaroslav@gmail.com"))).toBe(true);
  });

  it("Jiří Střelec (e-mail) je povolen", () => {
    expect(isCeoFocusAllowed(ctxFor("jstrelec@vlastnicesta.cz"))).toBe(true);
  });

  it("e-mail je case-insensitive", () => {
    expect(isCeoFocusAllowed(ctxFor("VINER.JAROSLAV@GMAIL.COM"))).toBe(true);
  });

  it("jiný EXECUTIVE/ADMIN, který prochází isAdminOrExecutive, sem NESMÍ", () => {
    expect(isCeoFocusAllowed(ctxFor("jaroslavblahout@gmail.com"))).toBe(false);
    expect(isCeoFocusAllowed(ctxFor("lucie.konigsbergova@seznam.cz"))).toBe(false);
  });

  it("nepřihlášený (null ctx) není povolen", () => {
    expect(isCeoFocusAllowed(null)).toBe(false);
  });

  it("libovolný jiný e-mail není povolen", () => {
    expect(isCeoFocusAllowed(ctxFor("nekdo.jiny@example.com"))).toBe(false);
  });
});

describe("requireCeoFocusAccess — Security Phase 17", () => {
  it("povolenému uživateli vrátí ctx beze změny", () => {
    const ctx = ctxFor("viner.jaroslav@gmail.com");
    expect(requireCeoFocusAccess(ctx)).toBe(ctx);
  });

  it("nepřihlášený vyhodí UnauthenticatedError", () => {
    expect(() => requireCeoFocusAccess(null)).toThrow(UnauthenticatedError);
  });

  it("nepovolený přihlášený uživatel vyhodí ForbiddenError", () => {
    expect(() => requireCeoFocusAccess(ctxFor("jaroslavblahout@gmail.com"))).toThrow(ForbiddenError);
  });
});
