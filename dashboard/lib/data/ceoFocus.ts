// Security Phase 17 (CEO přehled 1.0) — datová vrstva. Stejný princip
// jako companyNodes.ts/leads.ts: kontrola a dotaz jsou neoddělitelné,
// každá exportovaná funkce si sama volá requireCeoFocusContext(). Gate je
// z ceoFocusAuth.ts (allowlist 2 konkrétních lidí), ne z adminAuth.ts —
// viz komentář tam.
import "server-only";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { focusProjects, focusProjectActivity, userRoles } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireCeoFocusAccess } from "./ceoFocusAuth";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import {
  validateCreateFocusProjectInput,
  validateUpdateFocusProjectInput,
  compareFocusProjectsForList,
  type FocusStatus,
  type FocusPriority,
  type UpdateFocusProjectInput,
} from "./ceoFocusValidation";
import type { AuthContext } from "./types";

export async function requireCeoFocusContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireCeoFocusAccess(ctx);
}

export type StaffOption = { userId: string; name: string | null; email: string };

// Vlastní kopie stejného pickeru jako v leads.ts/orders.ts — záměrně, ne
// cross-import mezi doménami (viz komentář u leads.ts:listStaffOptions).
export async function listCeoFocusStaffOptions(): Promise<StaffOption[]> {
  await requireCeoFocusContext();

  const roleRows = await db
    .selectDistinct({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.systemRole, ["ADMIN", "EXECUTIVE", "EMPLOYEE"]));

  const userIds = roleRows.map((r) => r.userId);
  const profiles = await getUserProfiles(userIds);

  return userIds
    .map((userId) => {
      const profile = profiles.get(userId);
      return profile ? { userId, name: profile.name, email: profile.email } : null;
    })
    .filter((v): v is StaffOption => v !== null)
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

export type FocusProjectCardData = {
  id: string;
  title: string;
  priority: FocusPriority;
  status: FocusStatus;
  statusReason: string | null;
  description: string | null;
  nextStep: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  isActiveNow: boolean;
  updatedAt: Date;
};

type ProjectRow = typeof focusProjects.$inferSelect;

async function buildCardData(rows: ProjectRow[]): Promise<FocusProjectCardData[]> {
  if (rows.length === 0) {
    return [];
  }
  const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter((v): v is string => v !== null))];
  const owners = await getUserProfiles(ownerIds);

  return rows.map((r) => {
    const owner = r.ownerUserId ? owners.get(r.ownerUserId) : null;
    return {
      id: r.id,
      title: r.title,
      priority: r.priority as FocusPriority,
      status: r.status as FocusStatus,
      statusReason: r.statusReason,
      description: r.description,
      nextStep: r.nextStep,
      ownerUserId: r.ownerUserId,
      ownerName: owner?.name ?? owner?.email ?? null,
      isActiveNow: r.isActiveNow,
      updatedAt: r.updatedAt,
    };
  });
}

// Security Phase 16.4 princip (deterministické řazení) uplatněný rovnou od
// začátku — aktivní projekt první, pak priorita, pak nejnovější
// aktualizace, id jako tiebreak. Viz compareFocusProjectsForList.
export async function listFocusProjects(): Promise<FocusProjectCardData[]> {
  await requireCeoFocusContext();

  const rows = await db.select().from(focusProjects);
  const sortedRows = [...rows].sort((a, b) =>
    compareFocusProjectsForList(
      { id: a.id, priority: a.priority as FocusPriority, isActiveNow: a.isActiveNow, updatedAt: a.updatedAt },
      { id: b.id, priority: b.priority as FocusPriority, isActiveNow: b.isActiveNow, updatedAt: b.updatedAt }
    )
  );

  return buildCardData(sortedRows);
}

export type FocusActivityEntry = {
  id: string;
  kind: string;
  authorUserId: string;
  authorName: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type FocusProjectDetail = {
  project: FocusProjectCardData;
  activity: FocusActivityEntry[];
};

export async function getFocusProjectDetail(projectId: string): Promise<FocusProjectDetail | null> {
  await requireCeoFocusContext();

  const [row] = await db.select().from(focusProjects).where(eq(focusProjects.id, projectId)).limit(1);
  if (!row) {
    return null;
  }

  const [project] = await buildCardData([row]);

  const activityRows = await db
    .select()
    .from(focusProjectActivity)
    .where(eq(focusProjectActivity.projectId, projectId));
  activityRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    project,
    activity: activityRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      authorUserId: r.authorUserId,
      authorName: r.authorName,
      body: r.body,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  };
}

export type CreateFocusProjectResult = { ok: true; id: string } | { ok: false; error: string };

export async function createFocusProject(rawTitle: string): Promise<CreateFocusProjectResult> {
  const ctx = await requireCeoFocusContext();

  const validated = validateCreateFocusProjectInput({ title: rawTitle });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const id = randomUUID();
  await db.batch([
    db.insert(focusProjects).values({
      id,
      title: validated.value.title,
      createdBy: ctx.userId,
    }),
    db.insert(focusProjectActivity).values({
      projectId: id,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "created",
    }),
  ]);

  return { ok: true, id };
}

export type FocusResult = { ok: true } | { ok: false; error: string };

// Kombinovaná rychlá aktualizace — jeden formulář, jeden submit, stejný
// princip jako logCallOutcome v CRM (Security Phase 16). Prázdné pole se
// NIKDY neukládá jako přepsání na NULL/výchozí hodnotu — jen se vynechá
// z UPDATE, takže dosavadní hodnota zůstává (partial update).
export async function updateFocusProject(
  projectId: string,
  rawInput: UpdateFocusProjectInput
): Promise<FocusResult> {
  const ctx = await requireCeoFocusContext();

  const validated = validateUpdateFocusProjectInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const [current] = await db
    .select({ status: focusProjects.status })
    .from(focusProjects)
    .where(eq(focusProjects.id, projectId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Projekt nebyl nalezen." };
  }

  const updates: Partial<typeof focusProjects.$inferInsert> = { updatedAt: new Date() };
  if (value.status !== null) updates.status = value.status;
  if (value.statusReason !== null) updates.statusReason = value.statusReason;
  if (value.priority !== null) updates.priority = value.priority;
  if (value.description !== null) updates.description = value.description;
  if (value.nextStep !== null) updates.nextStep = value.nextStep;

  await db.batch([
    db.update(focusProjects).set(updates).where(eq(focusProjects.id, projectId)),
    db.insert(focusProjectActivity).values({
      projectId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "updated",
      body: value.note,
      metadata: {
        statusFrom: value.status !== null ? current.status : undefined,
        status: value.status,
        statusReason: value.statusReason,
        priority: value.priority,
        description: value.description,
        nextStep: value.nextStep,
      },
    }),
  ]);

  return { ok: true };
}

export async function assignFocusOwner(projectId: string, ownerUserId: string): Promise<FocusResult> {
  const ctx = await requireCeoFocusContext();

  const owner = await getUserProfile(ownerUserId);
  if (!owner) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [project] = await db
    .select({ id: focusProjects.id })
    .from(focusProjects)
    .where(eq(focusProjects.id, projectId))
    .limit(1);
  if (!project) {
    return { ok: false, error: "Projekt nebyl nalezen." };
  }

  await db.batch([
    db.update(focusProjects).set({ ownerUserId, updatedAt: new Date() }).where(eq(focusProjects.id, projectId)),
    db.insert(focusProjectActivity).values({
      projectId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "owner_assigned",
      metadata: { ownerUserId, ownerName: owner.name ?? owner.email },
    }),
  ]);

  return { ok: true };
}

// Nejvýše jeden projekt smí být aktivní zároveň — vynuceno tady, ne DB
// constraintem (viz schema.ts komentář u focusProjects.isActiveNow).
// Obě UPDATE + INSERT aktivity v jednom db.batch, aby nemohl vzniknout
// mezistav se dvěma aktivními projekty zároveň.
export async function setActiveFocusProject(projectId: string): Promise<FocusResult> {
  const ctx = await requireCeoFocusContext();

  const [project] = await db
    .select({ id: focusProjects.id })
    .from(focusProjects)
    .where(eq(focusProjects.id, projectId))
    .limit(1);
  if (!project) {
    return { ok: false, error: "Projekt nebyl nalezen." };
  }

  const otherProjects = (await db.select({ id: focusProjects.id }).from(focusProjects)).filter(
    (p) => p.id !== projectId
  );

  await db.batch([
    db
      .update(focusProjects)
      .set({ isActiveNow: true, updatedAt: new Date() })
      .where(eq(focusProjects.id, projectId)),
    db.insert(focusProjectActivity).values({
      projectId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "activated",
    }),
    ...otherProjects.map((p) => db.update(focusProjects).set({ isActiveNow: false }).where(eq(focusProjects.id, p.id))),
  ]);

  return { ok: true };
}

export async function clearActiveFocusProject(projectId: string): Promise<FocusResult> {
  await requireCeoFocusContext();

  const [project] = await db
    .select({ id: focusProjects.id })
    .from(focusProjects)
    .where(eq(focusProjects.id, projectId))
    .limit(1);
  if (!project) {
    return { ok: false, error: "Projekt nebyl nalezen." };
  }

  await db
    .update(focusProjects)
    .set({ isActiveNow: false, updatedAt: new Date() })
    .where(eq(focusProjects.id, projectId));

  return { ok: true };
}
