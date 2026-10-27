// Práce 1.0 — datová vrstva pracovní obrazovky /prace. Každá funkce si
// oprávnění ověřuje sama (workTasksAuth.ts), identita vždy ze server-side
// session, nikdy od klienta. Splnění/vrácení je jeden atomický SQL příkaz
// (změna stavu + záznam do historie), protože neon-http nemá interaktivní
// transakce — souběžné dvojí klepnutí zapíše historii jen jednou.
import "server-only";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workTaskActivity, workTasks } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { getUserProfiles } from "./userProfiles";
import { WORK_ASSIGNEES, isWorkManager, requireWorkAccess, requireWorkManager } from "./workTasksAuth";
import {
  diffWorkTask,
  pragueToday,
  sortWorkTasks,
  validateCancelReason,
  validateCreateWorkTask,
  type CreateWorkTaskInput,
} from "./workTasksValidation";

export type WorkTaskHistoryEntry = { kind: string; actorName: string | null; createdAt: Date; metadata: unknown };

export type WorkTaskView = {
  id: string;
  title: string;
  description: string | null;
  assigneeUserId: string;
  assigneeName: string;
  dueDate: string | null;
  priority: string;
  status: string;
  doneAt: Date | null;
  doneByName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  history: WorkTaskHistoryEntry[];
};

export type WorkTasksResult = { ok: true } | { ok: false; error: string };

const DONE_VISIBLE_DAYS = 7;

type WorkTaskRow = typeof workTasks.$inferSelect;

async function toViews(rows: WorkTaskRow[]): Promise<WorkTaskView[]> {
  const ids = rows.map((r) => r.id);
  const activity = ids.length
    ? await db.select().from(workTaskActivity).where(inArray(workTaskActivity.taskId, ids)).orderBy(desc(workTaskActivity.createdAt))
    : [];
  const historyByTask = new Map<string, WorkTaskHistoryEntry[]>();
  for (const a of activity) {
    const list = historyByTask.get(a.taskId) ?? [];
    list.push({ kind: a.kind, actorName: a.actorName, createdAt: a.createdAt, metadata: a.metadata });
    historyByTask.set(a.taskId, list);
  }
  const userIds = [...new Set(rows.flatMap((r) => [r.assigneeUserId, r.doneBy, r.cancelledBy].filter((x): x is string => !!x)))];
  const profiles = userIds.length ? await getUserProfiles(userIds) : new Map<string, { name: string | null; email: string }>();
  const nameOf = (id: string | null) => (id ? (profiles.get(id)?.name ?? profiles.get(id)?.email ?? null) : null);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    assigneeUserId: r.assigneeUserId,
    assigneeName: nameOf(r.assigneeUserId) ?? WORK_ASSIGNEES.find((a) => a.userId === r.assigneeUserId)?.name ?? "—",
    dueDate: r.dueDate,
    priority: r.priority,
    status: r.status,
    doneAt: r.doneAt,
    doneByName: nameOf(r.doneBy),
    cancelledAt: r.cancelledAt,
    cancelledByName: nameOf(r.cancelledBy),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    history: historyByTask.get(r.id) ?? [],
  }));
}

const CANCELLED_VISIBLE_DAYS = 30;

/**
 * Pracovník vidí jen svoje úkoly; vedoucí všechny. Aktivní seznam = otevřené
 * + splněné za posledních 7 dní; zrušené (posledních 30 dní) zvlášť, jen
 * jako historie — z aktivního seznamu zaměstnance zmizí.
 */
export async function listWorkTasks(): Promise<{ isManager: boolean; today: string; tasks: WorkTaskView[]; cancelled: WorkTaskView[] }> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const doneSince = new Date(Date.now() - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  const cancelledSince = new Date(Date.now() - CANCELLED_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  const mine = (cond: ReturnType<typeof and>) => (manager ? cond : and(eq(workTasks.assigneeUserId, ctx.userId), cond));

  const rows = await db
    .select()
    .from(workTasks)
    .where(mine(or(eq(workTasks.status, "open"), and(eq(workTasks.status, "done"), gte(workTasks.doneAt, doneSince)))));
  const cancelledRows = await db
    .select()
    .from(workTasks)
    .where(mine(and(eq(workTasks.status, "cancelled"), gte(workTasks.cancelledAt, cancelledSince))))
    .orderBy(desc(workTasks.cancelledAt));

  const today = pragueToday();
  const [tasks, cancelled] = await Promise.all([toViews(rows), toViews(cancelledRows)]);
  return { isManager: manager, today, tasks: sortWorkTasks(tasks, today), cancelled };
}

/** Detail úkolu. Pracovník jen svůj; cizí nebo neexistující = null (stránka 404). */
export async function getWorkTask(taskId: string): Promise<{ isManager: boolean; today: string; task: WorkTaskView } | null> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) return null;
  const [row] = await db
    .select()
    .from(workTasks)
    .where(manager ? eq(workTasks.id, taskId) : and(eq(workTasks.id, taskId), eq(workTasks.assigneeUserId, ctx.userId)))
    .limit(1);
  if (!row) return null;
  const [task] = await toViews([row]);
  return { isManager: manager, today: pragueToday(), task };
}

export async function createWorkTask(input: CreateWorkTaskInput): Promise<WorkTasksResult> {
  const ctx = requireWorkManager(await getAuthContext());
  const validated = validateCreateWorkTask(
    input,
    WORK_ASSIGNEES.map((a) => a.userId)
  );
  if (!validated.ok) return validated;
  const v = validated.value;
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(workTasks).values({
      id,
      title: v.title,
      description: v.description,
      assigneeUserId: v.assigneeUserId,
      createdBy: ctx.userId,
      dueDate: v.dueDate,
      priority: v.priority,
    }),
    db.insert(workTaskActivity).values({ taskId: id, actorUserId: ctx.userId, actorName: ctx.name ?? ctx.email, kind: "created" }),
  ]);
  return { ok: true };
}

/**
 * Splnit (done=true) / vrátit mezi nesplněné (done=false). Pracovník jen
 * SVŮJ úkol, vedoucí kterýkoli. Stav + historie jedním příkazem; když se
 * stav nezměnil (už splněno / cizí úkol), nezapíše se nic.
 */
export async function setWorkTaskDone(taskId: string, done: boolean): Promise<WorkTasksResult> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const actorName = ctx.name ?? ctx.email;
  const ownerCheck = manager ? sql`TRUE` : sql`assignee_user_id = ${ctx.userId}`;

  const result = done
    ? await db.execute<{ id: string }>(sql`
        WITH upd AS (
          UPDATE work_tasks SET status = 'done', done_at = now(), done_by = ${ctx.userId}, updated_at = now()
          WHERE id = ${taskId} AND status = 'open' AND ${ownerCheck}
          RETURNING id
        )
        INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind)
        SELECT id, ${ctx.userId}, ${actorName}, 'done' FROM upd
        RETURNING id`)
    : await db.execute<{ id: string }>(sql`
        WITH upd AS (
          UPDATE work_tasks SET status = 'open', done_at = NULL, done_by = NULL, updated_at = now()
          WHERE id = ${taskId} AND status = 'done' AND ${ownerCheck}
          RETURNING id
        )
        INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind)
        SELECT id, ${ctx.userId}, ${actorName}, 'reopened' FROM upd
        RETURNING id`);

  if (result.rows.length === 0) {
    return { ok: false, error: done ? "Úkol už je splněný nebo k němu nemáte přístup." : "Úkol není splněný nebo k němu nemáte přístup." };
  }
  return { ok: true };
}

/**
 * Práce 1.1 — úprava zadání (jen vedoucí). Každá skupina změn = vlastní
 * záznam historie (zadání / priorita / přeřazení) s from/to. Změna stavu i
 * historie jedním příkazem; když mezitím úkol změnil někdo jiný (jiné
 * updated_at) nebo je zrušený, nezapíše se nic.
 */
export async function updateWorkTask(taskId: string, input: CreateWorkTaskInput): Promise<WorkTasksResult & { changed?: number }> {
  const ctx = requireWorkManager(await getAuthContext());
  const validated = validateCreateWorkTask(input, WORK_ASSIGNEES.map((a) => a.userId));
  if (!validated.ok) return validated;
  const v = validated.value;

  const [current] = await db.select().from(workTasks).where(eq(workTasks.id, taskId)).limit(1);
  if (!current) return { ok: false, error: "Úkol nebyl nalezen." };
  if (current.status === "cancelled") return { ok: false, error: "Zrušený úkol nejde upravit." };

  const changes = diffWorkTask(current, v);
  if (changes.length === 0) return { ok: true, changed: 0 };

  const actorName = ctx.name ?? ctx.email;
  const values = sql.join(
    changes.map((c) => sql`(${c.kind}, ${JSON.stringify(c.metadata)}::jsonb)`),
    sql`, `
  );
  const result = await db.execute<{ id: string }>(sql`
    WITH upd AS (
      UPDATE work_tasks
         SET title = ${v.title}, description = ${v.description}, due_date = ${v.dueDate}::date,
             priority = ${v.priority}, assignee_user_id = ${v.assigneeUserId}, updated_at = now()
       WHERE id = ${taskId} AND status <> 'cancelled'
         AND abs(extract(epoch FROM updated_at - ${current.updatedAt.toISOString()}::timestamptz)) < 0.001
       RETURNING id
    )
    INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
    SELECT upd.id, ${ctx.userId}, ${actorName}, c.kind, c.metadata
      FROM upd CROSS JOIN (VALUES ${values}) AS c(kind, metadata)
    RETURNING id`);
  if (result.rows.length === 0) {
    return { ok: false, error: "Úkol mezitím změnil někdo jiný nebo byl zrušen. Načtěte ho prosím znovu." };
  }
  return { ok: true, changed: changes.length };
}

/** Práce 1.1 — zrušení (jen vedoucí, jen nesplněný úkol). Nic se nemaže. */
export async function cancelWorkTask(taskId: string, rawReason: string): Promise<WorkTasksResult> {
  const ctx = requireWorkManager(await getAuthContext());
  const reason = validateCancelReason(rawReason);
  if (!reason.ok) return reason;
  const actorName = ctx.name ?? ctx.email;
  const result = await db.execute<{ id: string }>(sql`
    WITH upd AS (
      UPDATE work_tasks SET status = 'cancelled', cancelled_at = now(), cancelled_by = ${ctx.userId}, updated_at = now()
       WHERE id = ${taskId} AND status = 'open'
       RETURNING id
    )
    INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
    SELECT id, ${ctx.userId}, ${actorName}, 'cancelled', ${JSON.stringify({ reason: reason.value })}::jsonb FROM upd
    RETURNING id`);
  if (result.rows.length === 0) return { ok: false, error: "Zrušit jde jen nesplněný úkol (nebo už je zrušený)." };
  return { ok: true };
}
