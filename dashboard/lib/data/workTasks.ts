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
import { pragueToday, sortWorkTasks, validateCreateWorkTask, type CreateWorkTaskInput } from "./workTasksValidation";

export type WorkTaskHistoryEntry = { kind: string; actorName: string | null; createdAt: Date };

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
  createdAt: Date;
  history: WorkTaskHistoryEntry[];
};

export type WorkTasksResult = { ok: true } | { ok: false; error: string };

const DONE_VISIBLE_DAYS = 7;

/** Pracovník vidí jen svoje úkoly; vedoucí všechny. Otevřené + splněné za posledních 7 dní. */
export async function listWorkTasks(): Promise<{ isManager: boolean; today: string; tasks: WorkTaskView[] }> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const doneSince = new Date(Date.now() - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000);

  const visible = or(eq(workTasks.status, "open"), gte(workTasks.doneAt, doneSince));
  const rows = await db
    .select()
    .from(workTasks)
    .where(manager ? visible : and(eq(workTasks.assigneeUserId, ctx.userId), visible));

  const ids = rows.map((r) => r.id);
  const activity = ids.length
    ? await db.select().from(workTaskActivity).where(inArray(workTaskActivity.taskId, ids)).orderBy(desc(workTaskActivity.createdAt))
    : [];
  const historyByTask = new Map<string, WorkTaskHistoryEntry[]>();
  for (const a of activity) {
    const list = historyByTask.get(a.taskId) ?? [];
    list.push({ kind: a.kind, actorName: a.actorName, createdAt: a.createdAt });
    historyByTask.set(a.taskId, list);
  }

  const userIds = [...new Set(rows.flatMap((r) => [r.assigneeUserId, r.doneBy].filter((x): x is string => !!x)))];
  const profiles = userIds.length ? await getUserProfiles(userIds) : new Map<string, { name: string | null; email: string }>();
  const nameOf = (id: string | null) => (id ? (profiles.get(id)?.name ?? profiles.get(id)?.email ?? null) : null);

  const today = pragueToday();
  const tasks: WorkTaskView[] = rows.map((r) => ({
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
    createdAt: r.createdAt,
    history: historyByTask.get(r.id) ?? [],
  }));
  return { isManager: manager, today, tasks: sortWorkTasks(tasks, today) };
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
