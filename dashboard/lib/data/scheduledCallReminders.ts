// Jarda — upozornění na naplánovaný hovor 1.0. Výhradně pro denní cron
// (app/api/cron/daily-call-reminders) — na rozdíl od zbytku leads.ts BEZ
// requireCrmContext: cron nemá přihlášenou session, běží jako systém a
// potřebuje vidět hovory VŠECH vlastníků najednou, aby mohl každému
// poslat jen jeho vlastní denní shrnutí. Nikdy nevolat z uživatelského
// (session-gated) kódu — tam patří leads.ts:getScheduledCallsToday.
//
// Sjednoceno 13. 11. 2026: dnešní hovory = termín „Další kontakt“
// (next_follow_up_at, datum i hodina) v Europe/Prague.
import "server-only";
import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { ACTIVE_LEAD_STAGES, isTodayInPrague, leadDisplayName } from "./leadValidation";

export type ReminderItem = {
  leadId: string;
  displayName: string;
  contactPhone: string | null;
  callAt: Date;
};

export async function getScheduledCallsGroupedByOwnerToday(now: Date = new Date()): Promise<Map<string, ReminderItem[]>> {
  const rows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      contactPhone: leads.contactPhone,
      ownerUserId: leads.ownerUserId,
      nextFollowUpAt: leads.nextFollowUpAt,
    })
    .from(leads)
    .where(and(isNotNull(leads.nextFollowUpAt), isNotNull(leads.ownerUserId), inArray(leads.stage, ACTIVE_LEAD_STAGES)));

  const grouped = new Map<string, ReminderItem[]>();
  for (const r of rows) {
    if (!r.nextFollowUpAt || !r.ownerUserId || !isTodayInPrague(r.nextFollowUpAt, now)) {
      continue;
    }
    const list = grouped.get(r.ownerUserId) ?? [];
    list.push({
      leadId: r.id,
      displayName: leadDisplayName(r),
      contactPhone: r.contactPhone,
      callAt: r.nextFollowUpAt,
    });
    grouped.set(r.ownerUserId, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.callAt.getTime() - b.callAt.getTime());
  }
  return grouped;
}
