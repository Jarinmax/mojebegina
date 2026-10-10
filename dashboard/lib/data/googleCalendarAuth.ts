// Security Phase 20 (Google Kalendář 1.0) — izolovaná auth brána, stejný
// princip jako dailyCallsAuth.ts: konkrétní userId, ne role. Propojení
// Google účtu smí provést VÝHRADNĚ Jaroslav Blahout sám, přihlášený pod
// vlastním účtem — schváleno explicitně ("Viner uvidí stav propojení, ale
// nemůže připojit svůj Google účet jako Blahoutův kalendář"). Čtení stavu
// (připojeno/nepřipojeno) je širší — ADMIN/EXECUTIVE obecně, stejná
// množina jako requireDailyCallWorkerAccess.
import { isAdminOrExecutive } from "./adminAuth";
import { DAILY_CALL_LEAD_OWNER_USER_ID } from "./dailyCallsAuth";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

// Stejný zdroj pravdy jako Denní volání — Blahout je dnes jediný, pro
// koho propojení dává smysl (jeho kalendář, jeho hovory).
export const GOOGLE_CALENDAR_CONNECT_USER_ID = DAILY_CALL_LEAD_OWNER_USER_ID;

export function canConnectGoogleCalendar(ctx: AuthContext): boolean {
  return ctx !== null && ctx.userId === GOOGLE_CALENDAR_CONNECT_USER_ID && isAdminOrExecutive(ctx);
}

export function canViewGoogleCalendarStatus(ctx: AuthContext): boolean {
  return ctx !== null && isAdminOrExecutive(ctx);
}

export function requireGoogleCalendarConnectAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!canConnectGoogleCalendar(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}

export function requireGoogleCalendarStatusAccess(ctx: AuthContext): NonNullable<AuthContext> {
  if (!ctx) {
    throw new UnauthenticatedError();
  }
  if (!canViewGoogleCalendarStatus(ctx)) {
    throw new ForbiddenError();
  }
  return ctx;
}
