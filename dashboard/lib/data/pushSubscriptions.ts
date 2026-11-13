// Jarda — upozornění na naplánovaný hovor 1.0. Web Push odběry (VAPID),
// samostatná tabulka push_subscriptions (schema.ts) — jeden endpoint může
// mít jen jednoho vlastníka (unique index), takže nové přihlášení ze
// stejného zařízení/prohlížeče přepíše to staré (onConflictDoUpdate).
//
// Dvě části souboru, jasně oddělené:
//   1. uživatelem řízené akce (gate requireDailyCallWorkerAccess) — jen
//      Jarda/Viner si smí přihlásit/odhlásit SVOJE zařízení;
//   2. interní funkce pro denní cron (lib/data/scheduledCallReminders.ts
//      + app/api/cron/daily-call-reminders), BEZ gate — cron nemá
//      přihlášenou session, běží jako systém, posílá VŠEM vlastníkům
//      jejich vlastní dnešní hovory.
import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireDailyCallWorkerAccess } from "./dailyCallsAuth";
import { pushSubscriptionInputSchema, pushUnsubscribeInputSchema, type PushSubscriptionInput } from "./pushSubscriptionsValidation";

export async function saveSubscription(rawInput: unknown, userAgent: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = requireDailyCallWorkerAccess(await getAuthContext());

  const parsed = pushSubscriptionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Neplatná podoba odběru upozornění." };
  }
  const input: PushSubscriptionInput = parsed.data;

  await db
    .insert(pushSubscriptions)
    .values({
      userId: ctx.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: ctx.userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, lastSeenAt: new Date() },
    });

  return { ok: true };
}

export async function removeSubscription(rawInput: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = requireDailyCallWorkerAccess(await getAuthContext());

  const parsed = pushUnsubscribeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Neplatný požadavek na odhlášení." };
  }

  // userId v podmínce — nejde odhlásit cizí zařízení ani uhodnutým endpointem.
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, ctx.userId)));

  return { ok: true };
}

// --- Interní, jen pro denní cron (bez auth gate — viz komentář nahoře) ----

export type OwnerSubscription = { userId: string; endpoint: string; p256dh: string; auth: string };

export async function getSubscriptionsForOwners(ownerUserIds: string[]): Promise<OwnerSubscription[]> {
  if (ownerUserIds.length === 0) return [];
  return db
    .select({
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, ownerUserIds));
}

// Push server (web-push) vrátí 404/410, když prohlížeč odběr sám zrušil
// (odinstalace, vyčištění dat, delší neaktivita) — takový endpoint už
// nikdy nepůjde použít, mazání je bezpečné a nutné (jinak by se při
// každém denním běhu znovu a znovu selhávalo na mrtvém odběru).
export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
