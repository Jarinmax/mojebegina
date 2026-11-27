// PROJEKT BEGINA 1.0 — čtení a zápis. Volající MUSÍ předem ověřit
// isInvoiceIssuer (jen Jaroslav a Lucie).
import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projectEntries } from "@/lib/db/schema";
import { pragueYearMonth } from "@/lib/eshop/partnerMonthlyServer";
import { PROJECT_AREAS, type ProjectAreaSlug, type ProjectInput, type ProjectKind } from "./areas";

export type ProjectEntry = {
  id: string;
  area: ProjectAreaSlug;
  kind: ProjectKind;
  entryDate: string;
  title: string | null;
  body: string | null;
  url: string | null;
  source: string;
  createdByName: string | null;
  createdAt: Date;
};

export type AreaSummary = { slug: ProjectAreaSlug; status: ProjectEntry | null; decisions: number; outputs: number; lastAt: Date | null };

/** false = tabulka v databázi ještě není (skript 125 nebyl spuštěn). */
export async function projectTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.project_entries') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

function toEntry(row: typeof projectEntries.$inferSelect): ProjectEntry {
  return {
    id: row.id,
    area: row.area as ProjectAreaSlug,
    kind: row.kind as ProjectKind,
    entryDate: row.entryDate,
    title: row.title,
    body: row.body,
    url: row.url,
    source: row.source,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}

export function todayPrague(): string {
  const now = pragueYearMonth(new Date());
  return `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
}

export async function loadArea(area: ProjectAreaSlug): Promise<{ status: ProjectEntry | null; statusHistory: ProjectEntry[]; decisions: ProjectEntry[]; outputs: ProjectEntry[] }> {
  const rows = (
    await db
      .select()
      .from(projectEntries)
      .where(and(eq(projectEntries.area, area), isNull(projectEntries.deletedAt)))
      .orderBy(desc(projectEntries.entryDate), desc(projectEntries.createdAt))
      .limit(500)
  ).map(toEntry);
  const statuses = rows.filter((r) => r.kind === "status").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return {
    status: statuses[0] ?? null,
    statusHistory: statuses.slice(1, 6),
    decisions: rows.filter((r) => r.kind === "decision"),
    outputs: rows.filter((r) => r.kind === "output"),
  };
}

export async function loadOverview(recentLimit = 5): Promise<{ areas: AreaSummary[]; recent: ProjectEntry[] }> {
  const rows = (
    await db.select().from(projectEntries).where(isNull(projectEntries.deletedAt)).orderBy(desc(projectEntries.createdAt)).limit(2000)
  ).map(toEntry);
  const areas = PROJECT_AREAS.map((a) => {
    const own = rows.filter((r) => r.area === a.slug);
    return {
      slug: a.slug,
      status: own.find((r) => r.kind === "status") ?? null,
      decisions: own.filter((r) => r.kind === "decision").length,
      outputs: own.filter((r) => r.kind === "output").length,
      lastAt: own[0]?.createdAt ?? null,
    };
  });
  return { areas, recent: rows.slice(0, recentLimit) };
}

export async function insertProjectEntry(
  input: ProjectInput,
  meta: { userId: string; name: string | null; source: "manual" | "agent"; sourceRef?: string | null; entryDate?: string }
): Promise<boolean> {
  const inserted = await db
    .insert(projectEntries)
    .values({
      ...input,
      entryDate: meta.entryDate ?? todayPrague(),
      source: meta.source,
      sourceRef: meta.sourceRef ?? null,
      createdByUserId: meta.userId,
      createdByName: meta.name,
    })
    .onConflictDoNothing({ target: [projectEntries.source, projectEntries.sourceRef] })
    .returning({ id: projectEntries.id });
  return inserted.length > 0;
}

export async function softDeleteProjectEntry(id: string): Promise<boolean> {
  const rows = await db
    .update(projectEntries)
    .set({ deletedAt: new Date() })
    .where(and(eq(projectEntries.id, id), isNull(projectEntries.deletedAt)))
    .returning({ id: projectEntries.id });
  return rows.length > 0;
}
