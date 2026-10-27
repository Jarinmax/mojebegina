// Práce 1.0/1.1/2.0 — datová vrstva pracovní obrazovky /prace. Každá funkce
// si oprávnění ověřuje sama (workTasksAuth.ts), identita vždy ze server-side
// session, nikdy od klienta. Každá změna stavu je JEDEN atomický SQL příkaz
// (stav + historie + upozornění), protože neon-http nemá interaktivní
// transakce — souběžné dvojí klepnutí nic nezdvojí.
//
// Stavy úkolu: open → (bez schválení) done
//              open/returned → (se schválením) submitted → done | returned
//              open/returned/submitted → cancelled
import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, workTaskActivity, workTaskPhotos, workTasks } from "@/lib/db/schema";
import { getPhotoStorage, isPhotoStorageConfigured } from "@/lib/prace/photoStorage";
import { sanitizeJpeg } from "@/lib/prace/jpeg";
import { getAuthContext } from "./authContext";
import { getUserProfiles } from "./userProfiles";
import { WORK_ASSIGNEES, WORK_MANAGER_USER_IDS, isWorkManager, requireWorkAccess, requireWorkManager } from "./workTasksAuth";
import {
  MAX_PHOTOS_PER_TASK,
  diffWorkTask,
  pragueToday,
  sortWorkTasks,
  validateCancelReason,
  validateCreateWorkTask,
  validateReturnReason,
  type CreateWorkTaskInput,
} from "./workTasksValidation";

export type WorkTaskHistoryEntry = { kind: string; actorName: string | null; createdAt: Date; metadata: unknown };

export type WorkTaskPhotoView = {
  id: string;
  uploadedByName: string | null;
  uploadedAt: Date;
  locked: boolean;
  /** Smí ji aktuální uživatel ještě odstranit (nahrál ji, není zamčená). */
  removable: boolean;
  width: number;
  height: number;
};

export type WorkTaskView = {
  id: string;
  title: string;
  description: string | null;
  assigneeUserId: string;
  assigneeName: string;
  dueDate: string | null;
  priority: string;
  status: string;
  photoRequirement: string;
  requiresApproval: boolean;
  doneAt: Date | null;
  doneByName: string | null;
  submittedAt: Date | null;
  submittedByName: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  returnReason: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  history: WorkTaskHistoryEntry[];
  photos: WorkTaskPhotoView[];
};

export type WorkTasksResult = { ok: true } | { ok: false; error: string };

const DONE_VISIBLE_DAYS = 7;
const CANCELLED_VISIBLE_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorkTaskRow = typeof workTasks.$inferSelect;

async function toViews(rows: WorkTaskRow[], viewerUserId: string): Promise<WorkTaskView[]> {
  const ids = rows.map((r) => r.id);
  const [activity, photos] = ids.length
    ? await Promise.all([
        db.select().from(workTaskActivity).where(inArray(workTaskActivity.taskId, ids)).orderBy(desc(workTaskActivity.createdAt)),
        db
          .select()
          .from(workTaskPhotos)
          .where(and(inArray(workTaskPhotos.taskId, ids), isNull(workTaskPhotos.deletedAt)))
          .orderBy(workTaskPhotos.uploadedAt),
      ])
    : [[], []];
  const historyByTask = new Map<string, WorkTaskHistoryEntry[]>();
  for (const a of activity) {
    const list = historyByTask.get(a.taskId) ?? [];
    list.push({ kind: a.kind, actorName: a.actorName, createdAt: a.createdAt, metadata: a.metadata });
    historyByTask.set(a.taskId, list);
  }
  const userIds = [
    ...new Set(
      [
        ...rows.flatMap((r) => [r.assigneeUserId, r.doneBy, r.cancelledBy, r.submittedBy, r.approvedBy]),
        ...photos.map((p) => p.uploadedBy),
      ].filter((x): x is string => !!x)
    ),
  ];
  const profiles = userIds.length ? await getUserProfiles(userIds) : new Map<string, { name: string | null; email: string }>();
  const nameOf = (id: string | null) => (id ? (profiles.get(id)?.name ?? profiles.get(id)?.email ?? null) : null);
  const photosByTask = new Map<string, WorkTaskPhotoView[]>();
  for (const p of photos) {
    const list = photosByTask.get(p.taskId) ?? [];
    list.push({
      id: p.id,
      uploadedByName: nameOf(p.uploadedBy),
      uploadedAt: p.uploadedAt,
      locked: p.lockedAt !== null,
      removable: p.lockedAt === null && p.uploadedBy === viewerUserId,
      width: p.width,
      height: p.height,
    });
    photosByTask.set(p.taskId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    assigneeUserId: r.assigneeUserId,
    assigneeName: nameOf(r.assigneeUserId) ?? WORK_ASSIGNEES.find((a) => a.userId === r.assigneeUserId)?.name ?? "—",
    dueDate: r.dueDate,
    priority: r.priority,
    status: r.status,
    photoRequirement: r.photoRequirement,
    requiresApproval: r.requiresApproval,
    doneAt: r.doneAt,
    doneByName: nameOf(r.doneBy),
    submittedAt: r.submittedAt,
    submittedByName: nameOf(r.submittedBy),
    approvedAt: r.approvedAt,
    approvedByName: nameOf(r.approvedBy),
    returnReason: r.returnReason,
    cancelledAt: r.cancelledAt,
    cancelledByName: nameOf(r.cancelledBy),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    history: historyByTask.get(r.id) ?? [],
    photos: photosByTask.get(r.id) ?? [],
  }));
}

/**
 * Pracovník vidí jen svoje úkoly; vedoucí všechny. `tasks` = nesplněné,
 * vrácené k opravě, čekající na schválení a splněné za 7 dní; zrušené
 * (30 dní) zvlášť, jen jako historie.
 */
export async function listWorkTasks(): Promise<{
  isManager: boolean;
  today: string;
  tasks: WorkTaskView[];
  cancelled: WorkTaskView[];
  photosEnabled: boolean;
}> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const doneSince = new Date(Date.now() - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  const cancelledSince = new Date(Date.now() - CANCELLED_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  const mine = (cond: SQL | undefined) => (manager ? cond : and(eq(workTasks.assigneeUserId, ctx.userId), cond));

  const rows = await db
    .select()
    .from(workTasks)
    .where(
      mine(
        or(
          inArray(workTasks.status, ["open", "returned", "submitted"]),
          and(eq(workTasks.status, "done"), gte(workTasks.doneAt, doneSince))
        )
      )
    );
  const cancelledRows = await db
    .select()
    .from(workTasks)
    .where(mine(and(eq(workTasks.status, "cancelled"), gte(workTasks.cancelledAt, cancelledSince))))
    .orderBy(desc(workTasks.cancelledAt));

  const today = pragueToday();
  const [tasks, cancelled] = await Promise.all([toViews(rows, ctx.userId), toViews(cancelledRows, ctx.userId)]);
  return { isManager: manager, today, tasks: sortWorkTasks(tasks, today), cancelled, photosEnabled: isPhotoStorageConfigured() };
}

/** Detail úkolu. Pracovník jen svůj; cizí nebo neexistující = null (stránka 404). */
export async function getWorkTask(
  taskId: string
): Promise<{ isManager: boolean; isAssignee: boolean; today: string; task: WorkTaskView; photosEnabled: boolean } | null> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  if (!UUID_RE.test(taskId)) return null;
  const [row] = await db
    .select()
    .from(workTasks)
    .where(manager ? eq(workTasks.id, taskId) : and(eq(workTasks.id, taskId), eq(workTasks.assigneeUserId, ctx.userId)))
    .limit(1);
  if (!row) return null;
  const [task] = await toViews([row], ctx.userId);
  return {
    isManager: manager,
    isAssignee: row.assigneeUserId === ctx.userId,
    today: pragueToday(),
    task,
    photosEnabled: isPhotoStorageConfigured(),
  };
}

const PHOTOS_OFF_ERROR = "Ukládání fotografií zatím není nastavené — fotografii u úkolu teď nejde vyžadovat.";

export async function createWorkTask(input: CreateWorkTaskInput): Promise<WorkTasksResult> {
  const ctx = requireWorkManager(await getAuthContext());
  const validated = validateCreateWorkTask(input, WORK_ASSIGNEES.map((a) => a.userId));
  if (!validated.ok) return validated;
  const v = validated.value;
  if (v.photoRequirement !== "none" && !isPhotoStorageConfigured()) return { ok: false, error: PHOTOS_OFF_ERROR };
  const id = randomUUID();
  await db.batch([
    db.insert(workTasks).values({
      id,
      title: v.title,
      description: v.description,
      assigneeUserId: v.assigneeUserId,
      createdBy: ctx.userId,
      dueDate: v.dueDate,
      priority: v.priority,
      photoRequirement: v.photoRequirement,
      requiresApproval: v.requiresApproval,
    }),
    db.insert(workTaskActivity).values({ taskId: id, actorUserId: ctx.userId, actorName: ctx.name ?? ctx.email, kind: "created" }),
  ]);
  return { ok: true };
}

const managersArray = () => sql`ARRAY[${sql.join(WORK_MANAGER_USER_IDS.map((m) => sql`${m}`), sql`, `)}]::text[]`;

/**
 * done=true: dokončit. Bez schválení → splněno; se schválením → „Čeká na
 * schválení“ + upozornění vedoucímu. U povinné fotky musí existovat aspoň
 * jedna uložená (kontrola přímo v SQL, nejen v UI). Fotky se zamknou.
 * done=false: vrátit splněný úkol mezi nesplněné (vedoucí vždy; pracovník
 * jen u úkolu bez schválení).
 */
export async function setWorkTaskDone(taskId: string, done: boolean): Promise<WorkTasksResult> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const actorName = ctx.name ?? ctx.email;
  const ownerCheck = manager ? sql`TRUE` : sql`assignee_user_id = ${ctx.userId}`;
  if (!UUID_RE.test(taskId)) return { ok: false, error: "Úkol nebyl nalezen." };

  if (!done) {
    const result = await db.execute<{ id: string }>(sql`
      WITH upd AS (
        UPDATE work_tasks
           SET status = 'open', done_at = NULL, done_by = NULL, approved_at = NULL, approved_by = NULL, updated_at = now()
         WHERE id = ${taskId} AND status = 'done' AND ${ownerCheck}
           AND (${manager}::boolean OR NOT requires_approval)
        RETURNING id
      )
      INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind)
      SELECT id, ${ctx.userId}, ${actorName}, 'reopened' FROM upd
      RETURNING id`);
    return result.rows.length === 0
      ? { ok: false, error: "Úkol není splněný nebo ho nemůžete vrátit." }
      : { ok: true };
  }

  const [current] = await db
    .select({
      status: workTasks.status,
      assigneeUserId: workTasks.assigneeUserId,
      photoRequirement: workTasks.photoRequirement,
    })
    .from(workTasks)
    .where(eq(workTasks.id, taskId))
    .limit(1);
  if (!current || (!manager && current.assigneeUserId !== ctx.userId)) {
    return { ok: false, error: "Úkol je už splněný nebo k němu nemáte přístup." };
  }
  if (current.status !== "open" && current.status !== "returned") {
    return { ok: false, error: "Úkol je už splněný nebo k němu nemáte přístup." };
  }

  const result = await db.execute<{ id: string; requires_approval: boolean }>(sql`
    WITH upd AS (
      UPDATE work_tasks
         SET status = CASE WHEN requires_approval THEN 'submitted' ELSE 'done' END,
             submitted_at = CASE WHEN requires_approval THEN now() ELSE submitted_at END,
             submitted_by = CASE WHEN requires_approval THEN ${ctx.userId} ELSE submitted_by END,
             done_at = CASE WHEN requires_approval THEN NULL ELSE now() END,
             done_by = CASE WHEN requires_approval THEN NULL ELSE ${ctx.userId} END,
             updated_at = now()
       WHERE id = ${taskId} AND status IN ('open', 'returned') AND ${ownerCheck}
         AND (photo_requirement <> 'required'
              OR EXISTS (SELECT 1 FROM work_task_photos p WHERE p.task_id = work_tasks.id AND p.deleted_at IS NULL))
      RETURNING id, requires_approval, title
    ),
    locked AS (
      UPDATE work_task_photos SET locked_at = now()
       WHERE task_id IN (SELECT id FROM upd) AND deleted_at IS NULL AND locked_at IS NULL
    ),
    act AS (
      INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
      SELECT id, ${ctx.userId}, ${actorName},
             CASE WHEN requires_approval THEN 'submitted' ELSE 'done' END,
             jsonb_build_object('photos', (SELECT count(*) FROM work_task_photos p WHERE p.task_id = upd.id AND p.deleted_at IS NULL))
        FROM upd
    ),
    notif AS (
      INSERT INTO notifications (user_id, type, title, body, href)
      SELECT m, 'work_task_submitted', 'Úkol ke kontrole', ${actorName}::text || ' odeslal(a) ke kontrole: ' || upd.title, '/prace/ukol/' || upd.id
        FROM upd CROSS JOIN unnest(${managersArray()}) AS m
       WHERE upd.requires_approval
    )
    SELECT id, requires_approval FROM upd`);

  if (result.rows.length === 0) {
    return current.photoRequirement === "required"
      ? { ok: false, error: "Přiložte alespoň jednu fotografii — u tohoto úkolu je povinná." }
      : { ok: false, error: "Úkol je už splněný nebo k němu nemáte přístup." };
  }
  return { ok: true };
}

/**
 * Práce 2.0 — kontrola vedoucím. Schválit → splněno (dokončil = kdo odeslal,
 * schválil = vedoucí); vrátit → „Vráceno k opravě“ s povinným důvodem.
 * V obou případech upozornění zaměstnanci.
 */
export async function reviewWorkTask(taskId: string, approve: boolean, rawReason: string): Promise<WorkTasksResult> {
  const ctx = requireWorkManager(await getAuthContext());
  const actorName = ctx.name ?? ctx.email;
  const reason = approve ? ({ ok: true, value: null } as const) : validateReturnReason(rawReason);
  if (!reason.ok) return reason;

  const result = approve
    ? await db.execute<{ id: string }>(sql`
        WITH upd AS (
          UPDATE work_tasks
             SET status = 'done', done_at = now(), done_by = submitted_by,
                 approved_at = now(), approved_by = ${ctx.userId}, return_reason = NULL, updated_at = now()
           WHERE id = ${taskId} AND status = 'submitted'
          RETURNING id, assignee_user_id, title
        ),
        act AS (
          INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind)
          SELECT id, ${ctx.userId}, ${actorName}, 'approved' FROM upd
        ),
        notif AS (
          INSERT INTO notifications (user_id, type, title, body, href)
          SELECT assignee_user_id, 'work_task_approved', 'Úkol schválen', ${actorName}::text || ' schválil(a): ' || title, '/prace/ukol/' || id
            FROM upd
        )
        SELECT id FROM upd`)
    : await db.execute<{ id: string }>(sql`
        WITH upd AS (
          UPDATE work_tasks
             SET status = 'returned', return_reason = ${reason.value}::text, updated_at = now()
           WHERE id = ${taskId} AND status = 'submitted'
          RETURNING id, assignee_user_id, title
        ),
        act AS (
          INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
          SELECT id, ${ctx.userId}, ${actorName}, 'returned', ${JSON.stringify({ reason: reason.value })}::jsonb FROM upd
        ),
        notif AS (
          INSERT INTO notifications (user_id, type, title, body, href)
          SELECT assignee_user_id, 'work_task_returned', 'Úkol vrácen k opravě', title || ' — ' || ${reason.value}::text, '/prace/ukol/' || id
            FROM upd
        )
        SELECT id FROM upd`);
  if (result.rows.length === 0) return { ok: false, error: "Úkol nečeká na schválení (už byl zkontrolován nebo zrušen)." };
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
  if (v.photoRequirement !== "none" && current.photoRequirement === "none" && !isPhotoStorageConfigured()) {
    return { ok: false, error: PHOTOS_OFF_ERROR };
  }

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
             priority = ${v.priority}, assignee_user_id = ${v.assigneeUserId},
             photo_requirement = ${v.photoRequirement}, requires_approval = ${v.requiresApproval}, updated_at = now()
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
       WHERE id = ${taskId} AND status IN ('open', 'returned', 'submitted')
       RETURNING id
    )
    INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
    SELECT id, ${ctx.userId}, ${actorName}, 'cancelled', ${JSON.stringify({ reason: reason.value })}::jsonb FROM upd
    RETURNING id`);
  if (result.rows.length === 0) return { ok: false, error: "Zrušit jde jen nesplněný úkol (nebo už je zrušený)." };
  return { ok: true };
}

// --- Práce 2.0: fotografie ---------------------------------------------------

/**
 * Přidá fotografii k úkolu. Smí zaměstnanec, kterému úkol patří (a vedoucí),
 * jen dokud úkol není odeslaný/splněný a jen když úkol fotku připouští.
 * Soubor se zkontroluje a vyčistí (GPS/EXIF pryč), uloží pod náhodným klíčem
 * do soukromého úložiště a teprve pak se zapíše do DB; když zápis neprojde,
 * soubor se z úložiště zase smaže.
 */
export async function addWorkTaskPhoto(taskId: string, raw: Uint8Array): Promise<WorkTasksResult & { photoId?: string }> {
  const ctx = requireWorkAccess(await getAuthContext());
  const manager = isWorkManager(ctx);
  const storage = getPhotoStorage();
  if (!storage) return { ok: false, error: "Ukládání fotografií zatím není nastavené." };
  if (!UUID_RE.test(taskId)) return { ok: false, error: "Úkol nebyl nalezen." };

  const [task] = await db
    .select({ status: workTasks.status, assigneeUserId: workTasks.assigneeUserId, photoRequirement: workTasks.photoRequirement })
    .from(workTasks)
    .where(eq(workTasks.id, taskId))
    .limit(1);
  if (!task || (!manager && task.assigneeUserId !== ctx.userId)) return { ok: false, error: "Úkol nebyl nalezen." };
  if (task.photoRequirement === "none") return { ok: false, error: "U tohoto úkolu se fotografie nepřikládají." };
  if (task.status !== "open" && task.status !== "returned") {
    return { ok: false, error: "Fotografie jde přidat jen k nesplněnému nebo vrácenému úkolu." };
  }

  const clean = sanitizeJpeg(raw);
  if (!clean.ok) return clean;
  const { bytes, width, height } = clean.value;
  const photoId = randomUUID();
  const storageKey = `prace/${taskId}/${photoId}.jpg`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await storage.put(storageKey, bytes);

  const actorName = ctx.name ?? ctx.email;
  const ownerCheck = manager ? sql`TRUE` : sql`assignee_user_id = ${ctx.userId}`;
  let inserted = 0;
  try {
    const result = await db.execute<{ id: string }>(sql`
      WITH t AS (
        SELECT id FROM work_tasks
         WHERE id = ${taskId} AND status IN ('open', 'returned') AND photo_requirement <> 'none' AND ${ownerCheck}
           AND (SELECT count(*) FROM work_task_photos WHERE task_id = ${taskId} AND deleted_at IS NULL) < ${MAX_PHOTOS_PER_TASK}
      ),
      ph AS (
        INSERT INTO work_task_photos (id, task_id, storage_key, content_type, size_bytes, width, height, sha256, uploaded_by)
        SELECT ${photoId}, id, ${storageKey}, 'image/jpeg', ${bytes.length}, ${width}, ${height}, ${sha256}, ${ctx.userId} FROM t
        RETURNING id, task_id
      )
      INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
      SELECT task_id, ${ctx.userId}, ${actorName}, 'photo_added', jsonb_build_object('photoId', id) FROM ph
      RETURNING id`);
    inserted = result.rows.length;
  } finally {
    if (inserted === 0) await storage.delete(storageKey).catch(() => undefined);
  }
  if (inserted === 0) {
    return { ok: false, error: `Fotografii nejde přidat (úkol se mezitím změnil, nebo už má ${MAX_PHOTOS_PER_TASK} fotografií).` };
  }
  return { ok: true, photoId };
}

/**
 * Odstraní omylem přiloženou fotografii — jen ten, kdo ji nahrál, a jen
 * dokud úkol nebyl odeslán/dokončen (fotka není zamčená). Záznam v DB
 * zůstává (deleted_at/by + historie), soubor z úložiště se smaže hned.
 */
export async function removeWorkTaskPhoto(photoId: string): Promise<WorkTasksResult> {
  const ctx = requireWorkAccess(await getAuthContext());
  if (!UUID_RE.test(photoId)) return { ok: false, error: "Fotografie nebyla nalezena." };
  const actorName = ctx.name ?? ctx.email;
  const result = await db.execute<{ storage_key: string }>(sql`
    WITH del AS (
      UPDATE work_task_photos SET deleted_at = now(), deleted_by = ${ctx.userId}
       WHERE id = ${photoId} AND uploaded_by = ${ctx.userId} AND locked_at IS NULL AND deleted_at IS NULL
       RETURNING id, task_id, storage_key
    ),
    act AS (
      INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind, metadata)
      SELECT task_id, ${ctx.userId}, ${actorName}, 'photo_removed', jsonb_build_object('photoId', id) FROM del
    )
    SELECT storage_key FROM del`);
  const row = result.rows[0];
  if (!row) return { ok: false, error: "Fotografii už nejde odstranit (úkol byl odeslán, nebo není vaše)." };
  await getPhotoStorage()
    ?.delete(row.storage_key)
    .catch((error) => console.error("Fotografii se nepodařilo smazat z úložiště", photoId, error));
  return { ok: true };
}

/** Pro zobrazení: klíč v úložišti jen pokud fotku smí aktuální uživatel vidět. */
export async function resolveWorkTaskPhoto(photoId: string): Promise<{ storageKey: string } | null> {
  const ctx = requireWorkAccess(await getAuthContext());
  if (!UUID_RE.test(photoId)) return null;
  const manager = isWorkManager(ctx);
  const [row] = await db
    .select({ storageKey: workTaskPhotos.storageKey, assigneeUserId: workTasks.assigneeUserId })
    .from(workTaskPhotos)
    .innerJoin(workTasks, eq(workTasks.id, workTaskPhotos.taskId))
    .where(and(eq(workTaskPhotos.id, photoId), isNull(workTaskPhotos.deletedAt)))
    .limit(1);
  if (!row || (!manager && row.assigneeUserId !== ctx.userId)) return null;
  return { storageKey: row.storageKey };
}

// --- Práce 2.0: upozornění v MojeBegina ---------------------------------------

export type WorkNotification = { id: string; title: string; body: string; href: string | null; createdAt: Date; read: boolean };

const WORK_NOTIFICATION_TYPES = like(notifications.type, "work_task_%");

/** Upozornění aktuálního uživatele k úkolům (nepřečtená první, posledních 30 dní). */
export async function listWorkNotifications(): Promise<WorkNotification[]> {
  const ctx = requireWorkAccess(await getAuthContext());
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), WORK_NOTIFICATION_TYPES, gte(notifications.createdAt, since)))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  return rows
    .map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, createdAt: n.createdAt, read: n.readAt !== null }))
    .sort((a, b) => Number(a.read) - Number(b.read));
}

/** Označí upozornění jako přečtená — jen vlastní; volitelně jen k jednomu odkazu (úkolu). */
export async function markWorkNotificationsRead(href?: string): Promise<void> {
  const ctx = requireWorkAccess(await getAuthContext());
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, ctx.userId),
        WORK_NOTIFICATION_TYPES,
        isNull(notifications.readAt),
        href ? eq(notifications.href, href) : undefined
      )
    );
}
