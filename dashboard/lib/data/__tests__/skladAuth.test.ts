// Security Phase 22 (Sklad 1.0 — bezpečný základ) — testy jemných,
// samostatných oprávnění (ne plošné ADMIN/EXECUTIVE). Ověřuje přesně
// matici schválenou vedením: Viner a Königsbergová mají všech 5 akcí,
// Blahout má 4 (bez storna), Střelec má jen ceny/originál (čtení).
import { describe, expect, it } from "vitest";
import {
  canConfirmGoodsReceipt,
  canReviewExtractedData,
  canUploadGoodsReceiptDocument,
  canViewPricesAndOriginal,
  canVoidGoodsReceipt,
  hasAnySkladAccess,
  requireAnySkladAccess,
  requireConfirmAccess,
  requireReviewAccess,
  requireUploadAccess,
  requireVoidAccess,
} from "../skladAuth";
import { ForbiddenError, UnauthenticatedError } from "../errors";
import type { AuthContext, SystemRole } from "../types";

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const KONIGSBERGOVA = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";
const CIZI_UZIVATEL = "99999999-9999-9999-9999-999999999999";

function ctxFor(userId: string, systemRole: SystemRole = "ADMIN"): AuthContext {
  return {
    userId,
    systemRole,
    grantedRoles: [systemRole],
    roleSelectionRequired: false,
    name: "Test",
    email: "test@example.com",
  };
}

describe("matice oprávnění — Jaroslav Viner (všech 5 akcí)", () => {
  const ctx = ctxFor(VINER, "ADMIN");
  it("má nahrání, kontrolu, potvrzení, ceny/originál i storno", () => {
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(true);
    expect(canReviewExtractedData(ctx)).toBe(true);
    expect(canConfirmGoodsReceipt(ctx)).toBe(true);
    expect(canViewPricesAndOriginal(ctx)).toBe(true);
    expect(canVoidGoodsReceipt(ctx)).toBe(true);
  });
});

describe("matice oprávnění — Lucie Königsbergová (všech 5 akcí)", () => {
  const ctx = ctxFor(KONIGSBERGOVA, "EXECUTIVE");
  it("má nahrání, kontrolu, potvrzení, ceny/originál i storno", () => {
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(true);
    expect(canReviewExtractedData(ctx)).toBe(true);
    expect(canConfirmGoodsReceipt(ctx)).toBe(true);
    expect(canViewPricesAndOriginal(ctx)).toBe(true);
    expect(canVoidGoodsReceipt(ctx)).toBe(true);
  });
});

describe("matice oprávnění — Jaroslav Blahout (4 akce, BEZ storna)", () => {
  const ctx = ctxFor(BLAHOUT, "EXECUTIVE");
  it("má nahrání, kontrolu, potvrzení i ceny/originál", () => {
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(true);
    expect(canReviewExtractedData(ctx)).toBe(true);
    expect(canConfirmGoodsReceipt(ctx)).toBe(true);
    expect(canViewPricesAndOriginal(ctx)).toBe(true);
  });

  it("NEMÁ storno", () => {
    expect(canVoidGoodsReceipt(ctx)).toBe(false);
    expect(() => requireVoidAccess(ctx)).toThrow(ForbiddenError);
  });
});

describe("matice oprávnění — Jiří Střelec (jen čtení cen/originálu)", () => {
  const ctx = ctxFor(STRELEC, "EXECUTIVE");

  it("má jen ceny/originál", () => {
    expect(canViewPricesAndOriginal(ctx)).toBe(true);
  });

  it("NEMÁ nahrání, kontrolu, potvrzení ani storno", () => {
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(false);
    expect(canReviewExtractedData(ctx)).toBe(false);
    expect(canConfirmGoodsReceipt(ctx)).toBe(false);
    expect(canVoidGoodsReceipt(ctx)).toBe(false);
    expect(() => requireUploadAccess(ctx)).toThrow(ForbiddenError);
    expect(() => requireReviewAccess(ctx)).toThrow(ForbiddenError);
    expect(() => requireConfirmAccess(ctx)).toThrow(ForbiddenError);
    expect(() => requireVoidAccess(ctx)).toThrow(ForbiddenError);
  });

  it("hasAnySkladAccess je true (má aspoň jedno z pěti oprávnění)", () => {
    expect(hasAnySkladAccess(ctx)).toBe(true);
    expect(() => requireAnySkladAccess(ctx)).not.toThrow();
  });
});

describe("cizí/neznámý uživatel nemá žádný přístup, i kdyby měl roli ADMIN", () => {
  const ctx = ctxFor(CIZI_UZIVATEL, "ADMIN");
  it("role sama nestačí — identita musí být na konkrétním allowlistu", () => {
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(false);
    expect(canReviewExtractedData(ctx)).toBe(false);
    expect(canConfirmGoodsReceipt(ctx)).toBe(false);
    expect(canViewPricesAndOriginal(ctx)).toBe(false);
    expect(canVoidGoodsReceipt(ctx)).toBe(false);
    expect(hasAnySkladAccess(ctx)).toBe(false);
  });
});

describe("nepřihlášený uživatel (ctx === null)", () => {
  it("require* vyhodí UnauthenticatedError, ne ForbiddenError", () => {
    expect(() => requireUploadAccess(null)).toThrow(UnauthenticatedError);
    expect(() => requireReviewAccess(null)).toThrow(UnauthenticatedError);
    expect(() => requireConfirmAccess(null)).toThrow(UnauthenticatedError);
    expect(() => requireVoidAccess(null)).toThrow(UnauthenticatedError);
    expect(() => requireAnySkladAccess(null)).toThrow(UnauthenticatedError);
  });
});

describe("roleSelectionRequired blokuje i uživatele na allowlistu (obrana do hloubky)", () => {
  it("Viner s nevybranou rolí (víc rolí, request bez platné volby) nemá přístup", () => {
    const ctx: AuthContext = {
      userId: VINER,
      systemRole: "ADMIN",
      grantedRoles: ["ADMIN", "EXECUTIVE"],
      roleSelectionRequired: true,
      name: "Jaroslav Viner",
      email: "viner@example.com",
    };
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(false);
    expect(canConfirmGoodsReceipt(ctx)).toBe(false);
  });
});

describe("budoucí EMPLOYEE 'skladník' — rozšiřitelnost beze změny ostatních kontrol", () => {
  it("EMPLOYEE role sama (bez userId na allowlistu) nemá dnes žádný přístup", () => {
    const ctx = ctxFor(CIZI_UZIVATEL, "EMPLOYEE");
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(false);
  });

  it("hasUploadRole (přes canUpload) je širší než hasManagementRole (přes canReview) — EMPLOYEE by při zařazení na allowlist upload prošel, review ne", () => {
    // Simulace budoucího stavu: kdyby EMPLOYEE uživatel byl přidán jen do
    // upload allowlistu, musí mu procházet upload, ale review/confirm/void
    // (hasManagementRole) ne, i kdyby ho tam někdo omylem přidal — to je
    // ověřené tím, že role samotná (EMPLOYEE) nikdy neprojde
    // hasManagementRole bez ohledu na allowlist, protože ty dvě kontroly
    // jsou nezávislé funkce v skladAuth.ts.
    const ctx = ctxFor(VINER, "EMPLOYEE");
    // Viner je na VŠECH allowlistech, ale s rolí EMPLOYEE mu
    // hasManagementRole (review/confirm/prices/void) neprojde — jen
    // hasUploadRole (upload) projde.
    expect(canUploadGoodsReceiptDocument(ctx)).toBe(true);
    expect(canReviewExtractedData(ctx)).toBe(false);
    expect(canConfirmGoodsReceipt(ctx)).toBe(false);
    expect(canViewPricesAndOriginal(ctx)).toBe(false);
    expect(canVoidGoodsReceipt(ctx)).toBe(false);
  });
});
