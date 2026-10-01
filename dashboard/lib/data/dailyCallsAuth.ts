// Security Phase 19 (Denní volání 1.0) — izolovaná auth brána, ale na
// rozdíl od crmAuth.ts (role ADMIN/EXECUTIVE = kdokoli s tou rolí) tady
// role NESTAČÍ: zadání výslovně vyžaduje rozlišení KONKRÉTNÍCH osob, ne
// jen rolí (další ADMIN/EXECUTIVE v budoucnu, např. Jiří Střelec, nesmí
// dostat přístup automaticky jen tím, že bude mít stejnou roli jako Viner
// nebo Blahout). Stejný princip jako ceoFocusAuth.ts (allowlist podle
// stabilního userId), ale tady navíc KOMBINOVANÝ s rolí jako druhou,
// nezávislou podmínkou ("role mohou být další podmínkou, ale ne jedinou",
// schváleno explicitně) — obrana do hloubky: i kdyby se userId shodovalo,
// bez odpovídající role se přístup neudělí (a naopak).
//
// userId ověřena přímo v Production DB (user_profiles), NE podle
// zobrazovaného jména:
//   Jaroslav Viner   = de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c (ADMIN)
//   Jaroslav Blahout = 06240ac4-c050-47ea-998c-6c81389edf9f (EXECUTIVE)
import { isAdmin, isAdminOrExecutive } from "./adminAuth";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

const CURATOR_USER_IDS = new Set<string>([
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", // Jaroslav Viner
]);

const WORKER_USER_IDS = new Set<string>([
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", // Jaroslav Viner
  "06240ac4-c050-47ea-998c-6c81389edf9f", // Jaroslav Blahout
]);

// Automatický návrh vybírá výhradně leady PŘIŘAZENÉ Blahoutovi (schváleno
// explicitně, bod 3/6 revidovaného návrhu) — jediné místo, kde je jeho
// userId potřeba mimo tenhle soubor, proto exportováno odsud (stejný zdroj
// pravdy jako WORKER_USER_IDS výše).
export const DAILY_CALL_LEAD_OWNER_USER_ID = "06240ac4-c050-47ea-998c-6c81389edf9f"; // Jaroslav Blahout

// Kurátor — sestavuje/upravuje/zveřejňuje frontu. V1 jen Viner, a jen
// pokud má zároveň roli ADMIN (dnešní stav; kdyby mu role zmizela, přístup
// zmizí s ní, i kdyby zůstal v allowlistu).
export function isDailyCallCurator(ctx: AuthContext): boolean {
  return ctx !== null && CURATOR_USER_IDS.has(ctx.userId) && isAdmin(ctx);
}

// Pracovník — vidí zveřejněnou frontu a zapisuje výsledky hovorů. V1 Viner
// i Blahout, oba navíc musí mít ADMIN nebo EXECUTIVE (dnešní stav obou).
export function isDailyCallWorker(ctx: AuthContext): boolean {
  return ctx !== null && WORKER_USER_IDS.has(ctx.userId) && isAdminOrExecutive(ctx);
}

export function requireDailyCallCuratorAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!isDailyCallCurator(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}

export function requireDailyCallWorkerAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!isDailyCallWorker(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}
