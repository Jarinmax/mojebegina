// Registr „Kontrola e-shopu – Lucie“ (8. 11. 2026) v existujícím /prace —
// žádná nová aplikace ani tabulka. Každý hlavní úkol BEG-01…BEG-16 je jeden
// úkol v work_tasks přidělený Lucii; v popisu je strukturovaná hlavička
// (priorita, technický stav, odpovědný) a kontrolní body, co otestovat
// a odkazy na PR / produkční stránky.
//
// Dva oddělené stavy:
//   • technický stav = řádek „Technický stav: …“ v popisu (upravuje vedoucí
//     / Claude podle auditu),
//   • kontrola Lucie = stav úkolu: open „Čeká na kontrolu Lucie“,
//     returned „Vráceno k opravě“, done „Schváleno Lucií“.
// Schválit / vrátit smí JEN Lucie sama (přidělená osoba) — nikdo ji za
// schvalující neoznačí. Historie (kdo, kdy, poznámka) je ve work_task_activity.
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workTasks } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { WORK_MANAGER_USER_IDS, isWorkManager, requireWorkAccess } from "./workTasksAuth";

import { ESHOP_CHECK_TITLE, parseEshopCheckHeader, type EshopCheckHeader } from "./eshopCheckRules";
export * from "./eshopCheckRules";

export type EshopCheckRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  header: EshopCheckHeader;
  returnReason: string | null;
  updatedAt: Date;
};

/** Všechny karty registru (i dávno schválené), seřazené podle BEG čísla. */
export async function listEshopChecks(): Promise<{ isManager: boolean; rows: EshopCheckRow[] }> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const rows = await db
    .select()
    .from(workTasks)
    .where(
      and(
        sql`${workTasks.title} ~ '^BEG-[0-9]{2}'`,
        sql`${workTasks.status} <> 'cancelled'`,
        manager ? sql`TRUE` : eq(workTasks.assigneeUserId, ctx.userId)
      )
    )
    .orderBy(asc(workTasks.title));
  return {
    isManager: manager,
    rows: rows.map((r) => ({
      id: r.id,
      code: ESHOP_CHECK_TITLE.exec(r.title)?.[0] ?? r.title,
      title: r.title.replace(ESHOP_CHECK_TITLE, "").replace(/^\s*[–—-]\s*/, ""),
      status: r.status,
      header: parseEshopCheckHeader(r.description),
      returnReason: r.returnReason,
      updatedAt: r.updatedAt,
    })),
  };
}

const managersArray = () => sql`ARRAY[${sql.join(WORK_MANAGER_USER_IDS.map((m) => sql`${m}`), sql`, `)}]::text[]`;

/**
 * Lucie: „Schválit opravu“ (nepovinná poznámka) nebo „Vrátit k opravě“
 * (povinný důvod). Jen přidělená osoba a jen u karty registru (BEG-xx).
 * Vedoucí dostane upozornění.
 */
export async function reviewEshopCheck(taskId: string, approve: boolean, rawNote: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = requireWorkAccess(await getAuthContext());
  const actorName = ctx.name ?? ctx.email;
  const note = rawNote.trim().slice(0, 2000);
  if (!approve && note.length < 3) return { ok: false, error: "Napište, co je potřeba opravit." };
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return { ok: false, error: "Úkol nebyl nalezen." };
  const meta = JSON.stringify(approve ? (note ? { note } : {}) : { reason: note });
  const result = await db.execute<{ id: string }>(sql`
    WITH upd AS (
      UPDATE work_tasks
         SET status = ${approve ? "done" : "returned"},
             done_at = ${approve ? sql`now()` : sql`NULL`},
             done_by = ${approve ? ctx.userId : null},
             approved_at = ${approve ? sql`now()` : sql`NULL`},
             approved_by = ${approve ? ctx.userId : null},
             return_reason = ${approve ? null : note}::text,
             updated_at = now()
       WHERE id = ${taskId}
         AND assignee_user_id = ${ctx.userId}
         AND title ~ '^BEG-[0-9]{2}'
         AND status IN ('open', 'returned')
      RETURNING id, title
    ),
    act AS (
      INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
      SELECT id, ${ctx.userId}, ${actorName}, ${approve ? "approved" : "returned"}, ${meta}::jsonb FROM upd
    ),
    notif AS (
      INSERT INTO notifications (user_id, type, title, body, href)
      SELECT m, ${approve ? "work_task_approved" : "work_task_returned"},
             ${approve ? "Kontrola e-shopu: schváleno" : "Kontrola e-shopu: vráceno k opravě"},
             ${actorName}::text || ': ' || upd.title || ${note ? ` — ${note}` : ""}::text,
             '/prace/ukol/' || upd.id
        FROM upd CROSS JOIN unnest(${managersArray()}) AS m
    )
    SELECT id FROM upd`);
  return result.rows.length === 0 ? { ok: false, error: "Kartu teď nejde zkontrolovat (není vaše, nebo už je schválená)." } : { ok: true };
}
