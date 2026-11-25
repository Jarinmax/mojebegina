// SEO – ukládání a čtení dat ze Search Console (tabulka seo_gsc_daily, skript 158).
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { summarizeQueries, type GscRow } from "./gsc";

export async function gscTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.seo_gsc_daily') IS NOT NULL AS present`);
  return (result.rows?.[0] as { present?: boolean } | undefined)?.present === true;
}

/** Přepíše dny, které Google poslal (data za poslední dny se ještě dopočítávají). */
export async function saveGscRows(rows: GscRow[]): Promise<number> {
  const days = [...new Set(rows.map((row) => row.day))];
  if (days.length === 0) return 0;
  await db.execute(sql`DELETE FROM seo_gsc_daily WHERE day = ANY(${days}::date[])`);
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await db.execute(sql`
      INSERT INTO seo_gsc_daily (day, query, page, clicks, impressions, position)
      SELECT * FROM unnest(${part.map((r) => r.day)}::date[], ${part.map((r) => r.query)}::text[], ${part.map((r) => r.page)}::text[],
                           ${part.map((r) => r.clicks)}::int[], ${part.map((r) => r.impressions)}::int[], ${part.map((r) => r.position)}::numeric[])
      ON CONFLICT (day, query, page) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, position = EXCLUDED.position`);
  }
  return rows.length;
}

/** Přehled za posledních N dní: hledané výrazy, poslední den s daty. null = tabulka chybí. */
export async function loadGscSummary(days: number) {
  if (!(await gscTableExists())) return null;
  const result = await db.execute(sql`
    SELECT query, sum(clicks)::int AS clicks, sum(impressions)::int AS impressions,
           (sum(position * impressions) / NULLIF(sum(impressions), 0))::float AS position
    FROM seo_gsc_daily
    WHERE day > (SELECT max(day) FROM seo_gsc_daily) - ${days}::int
    GROUP BY query`);
  const last = await db.execute(sql`SELECT to_char(max(day), 'YYYY-MM-DD') AS last FROM seo_gsc_daily`);
  const rows = (result.rows as { query: string; clicks: number; impressions: number; position: number | null }[]).map((row) => ({
    query: row.query,
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    position: row.position === null ? 0 : Number(row.position),
  }));
  return { lastDay: (last.rows?.[0] as { last?: string | null } | undefined)?.last ?? null, queries: summarizeQueries(rows) };
}
