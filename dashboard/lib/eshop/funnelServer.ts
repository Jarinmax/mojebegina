// MĚŘENÍ E-SHOPU 1.0 — čtení počítadel a objednávek pro přehled.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { FunnelStep } from "./funnel";

export type FunnelDay = { day: string; counts: Partial<Record<FunnelStep | "order" | "paid", number>> };

/** null = tabulka v databázi ještě není (skript 117 nebyl spuštěn). */
export async function loadFunnelDays(days: number): Promise<FunnelDay[] | null> {
  const exists = await db.execute(sql`SELECT to_regclass('public.eshop_funnel_daily') IS NOT NULL AS present`);
  if ((exists.rows?.[0] as { present?: boolean } | undefined)?.present !== true) return null;
  const result = await db.execute(sql`
    WITH d AS (
      SELECT generate_series((now() AT TIME ZONE 'Europe/Prague')::date - (${days}::int - 1), (now() AT TIME ZONE 'Europe/Prague')::date, interval '1 day')::date AS day
    ),
    o AS (
      SELECT (created_at AT TIME ZONE 'Europe/Prague')::date AS day,
             count(*)::int AS orders,
             count(*) FILTER (WHERE payment_status = 'paid')::int AS paid
      FROM orders WHERE channel = 'eshop' GROUP BY 1
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           COALESCE((SELECT jsonb_object_agg(f.step, f.count) FROM eshop_funnel_daily f WHERE f.day = d.day), '{}'::jsonb) AS steps,
           COALESCE(o.orders, 0) AS orders, COALESCE(o.paid, 0) AS paid
    FROM d LEFT JOIN o ON o.day = d.day
    ORDER BY d.day DESC
  `);
  return (result.rows as { day: string; steps: Record<string, number>; orders: number; paid: number }[]).map((row) => ({
    day: row.day,
    counts: { ...row.steps, order: Number(row.orders), paid: Number(row.paid) },
  }));
}

/** Týdenní report: posledních 7 ukončených dní a 7 dní před nimi (bez dneška). */
export async function loadFunnelWeeks(): Promise<{ week: FunnelDay[]; previous: FunnelDay[] } | null> {
  const days = await loadFunnelDays(15);
  if (days === null) return null;
  return { week: days.slice(1, 8), previous: days.slice(8, 15) };
}
