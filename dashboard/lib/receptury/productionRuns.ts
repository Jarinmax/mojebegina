// Várky (Jarin 27. 11. 2026): „dneska je pátek 27. 11., vařím kulajdu — cokoliv
// se stane, potřebuju vidět, kde jsem skončil.“ Každé odškrtnutí se hned
// zapíše do databáze, takže stav vidí každý počítač i mobil.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productionRuns } from "@/lib/db/schema";
import type { ItemUnit } from "./recipes";

export type RunItem = { name: string; quantity: number; unit: ItemUnit };
export type ProductionRun = {
  id: string;
  recipeSlug: string;
  recipeName: string;
  category: string;
  batchCount: number;
  batchMl: number;
  items: RunItem[];
  steps: string[];
  checks: string[];
  doneItems: number[];
  doneSteps: number[];
  startedByName: string | null;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  cancelledAt: Date | null;
};
export type RunProgress = { doneItems: number[]; doneSteps: number[]; finished: boolean };

export async function productionRunsTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.production_runs') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

function toRun(row: typeof productionRuns.$inferSelect): ProductionRun {
  return {
    ...row,
    items: (row.items ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), unit: i.unit as ItemUnit })),
    steps: row.steps ?? [],
    checks: row.checks ?? [],
    doneItems: row.doneItems ?? [],
    doneSteps: row.doneSteps ?? [],
  };
}

export async function createRun(input: {
  recipeSlug: string;
  recipeName: string;
  category: string;
  batchCount: number;
  batchMl: number;
  items: RunItem[];
  steps: string[];
  checks: string[];
  userId: string;
  userName: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(productionRuns)
    .values({
      recipeSlug: input.recipeSlug,
      recipeName: input.recipeName,
      category: input.category,
      batchCount: input.batchCount,
      batchMl: input.batchMl,
      items: input.items,
      steps: input.steps,
      checks: input.checks,
      startedBy: input.userId,
      startedByName: input.userName,
    })
    .returning({ id: productionRuns.id });
  return row.id;
}

export async function getRun(id: string): Promise<ProductionRun | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(productionRuns).where(eq(productionRuns.id, id)).limit(1);
  return row ? toRun(row) : null;
}

/** Rozpracované várky (nedokončené a nezrušené), nejnovější nahoře. */
export async function listOpenRuns(recipeSlug?: string): Promise<ProductionRun[]> {
  const open = and(isNull(productionRuns.finishedAt), isNull(productionRuns.cancelledAt));
  const rows = await db
    .select()
    .from(productionRuns)
    .where(recipeSlug ? and(open, eq(productionRuns.recipeSlug, recipeSlug)) : open)
    .orderBy(desc(productionRuns.startedAt))
    .limit(50);
  return rows.map(toRun);
}

/**
 * Nastaví (ne přepne) jednu surovinu/krok — dvě otevřená okna se tak nemůžou
 * „přetahovat“: co klikneš jako hotové, zůstane hotové.
 */
export async function setRunMark(id: string, kind: "item" | "step", index: number, done: boolean): Promise<RunProgress | null> {
  if (!Number.isInteger(index) || index < 0 || index > 500) return null;
  const column = kind === "item" ? sql.raw('"done_items"') : sql.raw('"done_steps"');
  const result = await db.execute(sql`
    UPDATE production_runs
       SET ${column} = CASE WHEN ${done} THEN array_append(array_remove(${column}, ${index}::int), ${index}::int)
                            ELSE array_remove(${column}, ${index}::int) END,
           updated_at = now()
     WHERE id = ${id} AND finished_at IS NULL AND cancelled_at IS NULL
     RETURNING done_items, done_steps`);
  const row = (result.rows?.[0] ?? null) as { done_items: number[]; done_steps: number[] } | null;
  if (!row) return null;
  return { doneItems: row.done_items ?? [], doneSteps: row.done_steps ?? [], finished: false };
}

export async function getRunProgress(id: string): Promise<RunProgress | null> {
  const run = await getRun(id);
  if (!run) return null;
  return { doneItems: run.doneItems, doneSteps: run.doneSteps, finished: run.finishedAt !== null || run.cancelledAt !== null };
}

export async function closeRun(id: string, how: "finish" | "cancel"): Promise<boolean> {
  const set = how === "finish" ? { finishedAt: new Date(), updatedAt: new Date() } : { cancelledAt: new Date(), updatedAt: new Date() };
  const rows = await db
    .update(productionRuns)
    .set(set)
    .where(and(eq(productionRuns.id, id), isNull(productionRuns.finishedAt), isNull(productionRuns.cancelledAt)))
    .returning({ id: productionRuns.id });
  return rows.length > 0;
}

const DAYS = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
/** „pátek 27. 11. 2026 v 14:05“ (čas Prahy). */
export function formatRunDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayIndex = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Prague" })).getDay();
  return `${DAYS[weekdayIndex]} ${get("day")}. ${get("month")}. ${get("year")} v ${get("hour")}:${get("minute")}`;
}
