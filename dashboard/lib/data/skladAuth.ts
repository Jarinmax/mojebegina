// Security Phase 22 (Sklad 1.0 — bezpečný základ) — jemná, samostatná
// oprávnění pro jednotlivé akce (schváleno vedením, revize auditu
// "MojeBegina – skladové hospodářství 1.0"), NE plošné ADMIN/EXECUTIVE
// jako u ostatních /rizeni-firmy/* modulů. Stejný princip jako
// dailyCallsAuth.ts/invoiceAuth.ts: oprávnění podle KONKRÉTNÍ osoby
// (stabilní Neon Auth userId), role je jen DRUHÁ, nezávislá podmínka.
//
// userId ověřeny přímo v Production DB (user_profiles + user_roles,
// 9. 10. 2026, read-only dotaz):
//   Jaroslav Viner       = de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c (ADMIN)
//   Jaroslav Blahout     = 06240ac4-c050-47ea-998c-6c81389edf9f (EXECUTIVE)
//   Lucie Königsbergová  = f9f93f03-92b0-4724-becd-c0a3576b5275 (EXECUTIVE)
//   Jiří Střelec         = fdc7b836-2325-4568-b9b7-5ac579cd8972 (EXECUTIVE)
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const KONIGSBERGOVA = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";

// Matice schválená vedením (bod "Oprávnění pro MVP"):
//   Viner        — nahrání, kontrola, potvrzení, ceny/originál, storno
//   Königsbergová — nahrání, kontrola, potvrzení, ceny/originál, storno
//   Blahout      — nahrání, kontrola, potvrzení, ceny/originál (BEZ storna)
//   Střelec      — jen ceny/originál (čtení); bez nahrání, kontroly,
//                  potvrzení a storna
const UPLOAD_USER_IDS = new Set<string>([VINER, KONIGSBERGOVA, BLAHOUT]);
const REVIEW_USER_IDS = new Set<string>([VINER, KONIGSBERGOVA, BLAHOUT]);
const CONFIRM_USER_IDS = new Set<string>([VINER, KONIGSBERGOVA, BLAHOUT]);
const PRICES_AND_ORIGINAL_USER_IDS = new Set<string>([VINER, KONIGSBERGOVA, BLAHOUT, STRELEC]);
const VOID_USER_IDS = new Set<string>([VINER, KONIGSBERGOVA]);

// Dnešní role všech čtyř lidí je ADMIN/EXECUTIVE — tahle kontrola je
// druhá, nezávislá podmínka (obrana do hloubky), ne primární brána.
function hasManagementRole(ctx: AuthContext): boolean {
  return ctx !== null && !ctx.roleSelectionRequired && (ctx.systemRole === "ADMIN" || ctx.systemRole === "EXECUTIVE");
}

// Budoucí skladník/EMPLOYEE NENÍ součástí MVP (schváleno explicitně) —
// ale architektura musí umožnit přidat POUZE oprávnění k nahrání, beze
// změny čehokoli jiného. Proto má nahrání VLASTNÍ, širší kontrolu role
// (navíc EMPLOYEE) oproti zbylým čtyřem akcím — až budoucí skladník
// dostane reálný userId, přidá se JEN do UPLOAD_USER_IDS výš; jeho role
// už `hasUploadRole` projde, zatímco `hasManagementRole` u ostatních
// čtyř akcí mu zůstane zavřená, i kdyby ho někdo omylem přidal i tam.
function hasUploadRole(ctx: AuthContext): boolean {
  return (
    ctx !== null &&
    !ctx.roleSelectionRequired &&
    (ctx.systemRole === "ADMIN" || ctx.systemRole === "EXECUTIVE" || ctx.systemRole === "EMPLOYEE")
  );
}

export function canUploadGoodsReceiptDocument(ctx: AuthContext): boolean {
  return ctx !== null && hasUploadRole(ctx) && UPLOAD_USER_IDS.has(ctx.userId);
}

export function canReviewExtractedData(ctx: AuthContext): boolean {
  return ctx !== null && hasManagementRole(ctx) && REVIEW_USER_IDS.has(ctx.userId);
}

export function canConfirmGoodsReceipt(ctx: AuthContext): boolean {
  return ctx !== null && hasManagementRole(ctx) && CONFIRM_USER_IDS.has(ctx.userId);
}

export function canViewPricesAndOriginal(ctx: AuthContext): boolean {
  return ctx !== null && hasManagementRole(ctx) && PRICES_AND_ORIGINAL_USER_IDS.has(ctx.userId);
}

export function canVoidGoodsReceipt(ctx: AuthContext): boolean {
  return ctx !== null && hasManagementRole(ctx) && VOID_USER_IDS.has(ctx.userId);
}

// Pro čistě informativní čtení (seznam lokací, seznam skladových karet) —
// kdokoli s alespoň jedním z pěti oprávnění smí vidět, že modul existuje
// a co obsahuje; konkrétní citlivá data (ceny, originál) mají svou
// vlastní, užší bránu (canViewPricesAndOriginal) nad rámec tohohle.
export function hasAnySkladAccess(ctx: AuthContext): boolean {
  return (
    canUploadGoodsReceiptDocument(ctx) ||
    canReviewExtractedData(ctx) ||
    canConfirmGoodsReceipt(ctx) ||
    canViewPricesAndOriginal(ctx) ||
    canVoidGoodsReceipt(ctx)
  );
}

function requireAccess(ctx: AuthContext, check: (ctx: AuthContext) => boolean): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!check(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}

export function requireUploadAccess(ctx: AuthContext): NonNullable<AuthContext> {
  return requireAccess(ctx, canUploadGoodsReceiptDocument);
}

export function requireReviewAccess(ctx: AuthContext): NonNullable<AuthContext> {
  return requireAccess(ctx, canReviewExtractedData);
}

export function requireConfirmAccess(ctx: AuthContext): NonNullable<AuthContext> {
  return requireAccess(ctx, canConfirmGoodsReceipt);
}

export function requirePricesAndOriginalAccess(ctx: AuthContext): NonNullable<AuthContext> {
  return requireAccess(ctx, canViewPricesAndOriginal);
}

export function requireVoidAccess(ctx: AuthContext): NonNullable<AuthContext> {
  return requireAccess(ctx, canVoidGoodsReceipt);
}

export function requireAnySkladAccess(ctx: AuthContext): NonNullable<AuthContext> {
  return requireAccess(ctx, hasAnySkladAccess);
}
