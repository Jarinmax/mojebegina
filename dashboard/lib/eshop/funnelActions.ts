"use server";

// MĚŘENÍ E-SHOPU 1.0 — zápis jednoho anonymního kroku. Ukládá se jen
// součet za den (Praha); IP adresa ani nic o návštěvníkovi se neukládá.
// Chyba (např. chybějící tabulka) nesmí nikdy rozbít e-shop.
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hasOptOutCookie, isBotUserAgent, isTrackedStep } from "./funnel";

export async function recordFunnelStep(step: string): Promise<void> {
  try {
    if (!isTrackedStep(step)) return;
    const h = await headers();
    if (isBotUserAgent(h.get("user-agent")) || hasOptOutCookie(h.get("cookie"))) return;
    await db.execute(sql`
      INSERT INTO eshop_funnel_daily (day, step, count)
      VALUES ((now() AT TIME ZONE 'Europe/Prague')::date, ${step}, 1)
      ON CONFLICT (day, step) DO UPDATE SET count = eshop_funnel_daily.count + 1
    `);
  } catch {
    // měření je jen doplněk
  }
}
