import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DigestEntry } from "./leadDigest";

/** Dnešní (pražský den) ruční zápisy obchodníků: hovory a poznámky, bez automatických. */
export async function loadTodayLeadEntries(today: string): Promise<DigestEntry[]> {
  const rows = (
    await db.execute(sql`
      SELECT la.lead_id, COALESCE(NULLIF(l.company_name, ''), l.contact_name, 'Lead') AS lead_name,
             COALESCE(la.author_name, '') AS author_name, la.created_at, COALESCE(la.body, '') AS body,
             la.kind, la.metadata
      FROM lead_activity la JOIN leads l ON l.id = la.lead_id
      WHERE (la.created_at AT TIME ZONE 'Europe/Prague')::date = ${today}::date
        AND (la.kind = 'call_logged'
             OR (la.kind = 'note_added' AND la.metadata IS NULL))
        AND COALESCE(la.author_name, '') NOT ILIKE '%přes ChatGPT%'
        AND COALESCE(la.author_name, '') NOT ILIKE 'Formulář%'
      ORDER BY la.created_at`)
  ).rows as { lead_id: string; lead_name: string; author_name: string; created_at: string | Date; body: string; kind: string; metadata: Record<string, unknown> | null }[];
  return rows.map((r) => {
    const next = r.metadata && typeof r.metadata.nextFollowUpAt === "string" ? new Date(r.metadata.nextFollowUpAt) : null;
    return {
      leadId: r.lead_id,
      leadName: r.lead_name,
      authorName: r.author_name || "Neznámý",
      createdAt: new Date(r.created_at),
      body: r.body || (r.kind === "call_logged" ? "Hovor bez poznámky" : "Poznámka"),
      noAnswer: r.metadata?.callResult === "no_answer",
      nextFollowUpAt: next,
    };
  });
}
