// Práce 1.0 — oprávnění pracovní obrazovky /prace. Stejný princip jako
// dailyCallsAuth.ts: konkrétní osoby (stabilní userId z user_profiles), ne
// jen role, a role jako druhá nezávislá podmínka. Další EXECUTIVE (Střelec,
// Königsbergová) sem tím automaticky přístup NEDOSTANOU.
//   • vedoucí (Viner, ADMIN) — zadává a přiděluje úkoly, vidí práci všech,
//   • pracovník (Blahout, EXECUTIVE) — vidí a plní JEN svoje úkoly.
import { isAdmin, isAdminOrExecutive } from "./adminAuth";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export const WORK_MANAGER_USER_ID = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c"; // Jaroslav Viner
export const WORK_ASSIGNEES: ReadonlyArray<{ userId: string; name: string }> = [
  { userId: "06240ac4-c050-47ea-998c-6c81389edf9f", name: "Jaroslav Blahout" },
];

export function isWorkManager(ctx: AuthContext): boolean {
  return ctx !== null && ctx.userId === WORK_MANAGER_USER_ID && isAdmin(ctx);
}

export function isWorkAssignee(ctx: AuthContext): boolean {
  return ctx !== null && WORK_ASSIGNEES.some((a) => a.userId === ctx.userId) && isAdminOrExecutive(ctx);
}

export function requireWorkAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) throw new UnauthenticatedError();
  if (!isWorkManager(ctx) && !isWorkAssignee(ctx)) throw new ForbiddenError();
  return ctx;
}

export function requireWorkManager(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) throw new UnauthenticatedError();
  if (!isWorkManager(ctx)) throw new ForbiddenError();
  return ctx;
}

/** Pracovník po přihlášení (role EXECUTIVE) přistane rovnou na /prace. */
export function landingForExecutive(userId: string): string {
  return WORK_ASSIGNEES.some((a) => a.userId === userId) ? "/prace" : "/executive";
}
