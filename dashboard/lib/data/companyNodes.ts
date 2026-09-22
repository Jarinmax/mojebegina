// Security Phase 12 (Řízení firmy 2.0) — datová vrstva živé mapy firmy.
// Stejný princip jako lib/data/admin.ts a companyManagement.ts: kontrola a
// dotaz jsou neoddělitelné, každá exportovaná funkce si sama volá
// requireCompanyNodeContext(). Gate je z companyNodeAuth.ts, ne z
// adminAuth.ts/companyManagementAuth.ts — viz komentář tam.
//
// Strom je v Begina měřítku malý (desítky, ne tisíce uzlů) — funkce tady
// proto záměrně načítají celý nearchivovaný strom najednou a stavějí si
// mapy v paměti (fetchTree), místo N+1 dotazů nebo rekurzivních SQL CTE.
// Jednodušší na čtení, dost rychlé pro tohle měřítko, a stejná logika
// (driver/počty) se dá sdílet mezi mapou i detailem uzlu.
import "server-only";
import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companyNodes, companyNodeActivity } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireCompanyNodeAccess } from "./companyNodeAuth";
import { getUserProfile } from "./userProfiles";
import {
  validateCreateNodeInput,
  validateTreeDepth,
  validateStatusInput,
  validatePriorityInput,
  validateCommentInput,
  validateClaimInput,
  type CreateNodeInput,
  type UpdateStatusInput,
  type CommentInput,
  type NodeStatus,
  type NodePriority,
} from "./companyNodeValidation";
import { computeAutoStatus, selectStatusDriver, type StatusChild } from "./statusPropagation";
import type { AuthContext } from "./types";

export async function requireCompanyNodeContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireCompanyNodeAccess(ctx);
}

type NodeRow = typeof companyNodes.$inferSelect;

async function fetchTree(): Promise<{
  rows: NodeRow[];
  byId: Map<string, NodeRow>;
  byParent: Map<string | null, NodeRow[]>;
}> {
  const rows = await db
    .select()
    .from(companyNodes)
    .where(isNull(companyNodes.archivedAt));

  const byId = new Map<string, NodeRow>();
  const byParent = new Map<string | null, NodeRow[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    const key = row.parentId;
    const siblings = byParent.get(key) ?? [];
    siblings.push(row);
    byParent.set(key, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
  }

  return { rows, byId, byParent };
}

function isLeaf(nodeId: string, byParent: Map<string | null, NodeRow[]>): boolean {
  return (byParent.get(nodeId)?.length ?? 0) === 0;
}

function collectDescendants(nodeId: string, byParent: Map<string | null, NodeRow[]>): NodeRow[] {
  const result: NodeRow[] = [];
  const stack = [...(byParent.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    stack.push(...(byParent.get(node.id) ?? []));
  }
  return result;
}

// Následuje status_driver_node_id řetězec dolů, dokud nedojde na uzel bez
// dalšího drivera (typicky konkrétní téma) — pro zobrazení "Měření teplot
// lednic" místo jen "něco v Provozu" na Area kartě.
function resolveDriverLeaf(node: NodeRow, byId: Map<string, NodeRow>): NodeRow | null {
  let current = node;
  const visited = new Set<string>();
  while (current.statusDriverNodeId && !visited.has(current.id)) {
    visited.add(current.id);
    const next = byId.get(current.statusDriverNodeId);
    if (!next) break;
    current = next;
  }
  return current.id === node.id ? null : current;
}

export type NodeCardData = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: NodeStatus;
  statusMode: "auto" | "manual";
  priority: NodePriority;
  ownerUserId: string | null;
  isLeaf: boolean;
  // Hlavní konkrétní důvod stavu — u "manual" uzlu jeho vlastní
  // status_reason, u "auto" uzlu název listového tématu, které stav
  // způsobilo (viz specifikace, bod 5 zadání "Řízení firmy 2.0").
  reasonTitle: string | null;
  // Počet dalších nezelených listových témat pod tímhle uzlem, mimo to,
  // které je uvedené jako reasonTitle.
  otherActiveCount: number;
  updatedAt: Date;
};

function buildCardData(
  node: NodeRow,
  byId: Map<string, NodeRow>,
  byParent: Map<string | null, NodeRow[]>
): NodeCardData {
  const leaf = isLeaf(node.id, byParent);
  let reasonTitle: string | null = null;

  if (node.status !== "green") {
    if (node.statusMode === "manual") {
      reasonTitle = node.statusReason;
    } else {
      const driver = resolveDriverLeaf(node, byId);
      reasonTitle = driver?.title ?? null;
    }
  }

  const descendantLeaves = collectDescendants(node.id, byParent).filter((d) =>
    isLeaf(d.id, byParent)
  );
  const activeLeaves = descendantLeaves.filter((d) => d.status !== "green");
  const driverLeaf = node.statusMode === "auto" ? resolveDriverLeaf(node, byId) : null;
  const otherActiveCount = activeLeaves.filter((d) => d.id !== driverLeaf?.id).length;

  return {
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    description: node.description,
    status: node.status as NodeStatus,
    statusMode: node.statusMode as "auto" | "manual",
    priority: node.priority as NodePriority,
    ownerUserId: node.ownerUserId,
    isLeaf: leaf,
    reasonTitle,
    otherActiveCount,
    updatedAt: node.updatedAt,
  };
}

export type CompanyMap = {
  areas: NodeCardData[];
  counts: { green: number; amber: number; red: number };
};

export async function getCompanyMap(): Promise<CompanyMap> {
  await requireCompanyNodeContext();

  const { byId, byParent } = await fetchTree();
  const areaRows = byParent.get(null) ?? [];
  const areas = areaRows.map((row) => buildCardData(row, byId, byParent));

  const counts = { green: 0, amber: 0, red: 0 };
  for (const area of areas) {
    counts[area.status] += 1;
  }

  return { areas, counts };
}

export type NodeActivityEntry = {
  id: string;
  kind: "comment" | "status_changed" | "owner_assigned" | "claim_offered" | "created";
  authorUserId: string;
  authorName: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type NodeDetail = {
  node: NodeCardData & { statusReason: string | null; ownerName: string | null };
  breadcrumb: { id: string; title: string }[];
  children: NodeCardData[];
  canAddChild: boolean;
  activity: NodeActivityEntry[];
};

export async function getNodeDetail(nodeId: string): Promise<NodeDetail | null> {
  await requireCompanyNodeContext();

  const { byId, byParent } = await fetchTree();
  const node = byId.get(nodeId);
  if (!node) {
    return null;
  }

  const breadcrumb: { id: string; title: string }[] = [];
  let ancestor: NodeRow | undefined = node;
  let depth = 0;
  while (ancestor) {
    breadcrumb.unshift({ id: ancestor.id, title: ancestor.title });
    depth += 1;
    ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
  }

  const children = (byParent.get(nodeId) ?? []).map((row) => buildCardData(row, byId, byParent));

  const ownerName = node.ownerUserId
    ? (await getUserProfile(node.ownerUserId).catch(() => null))?.name ?? null
    : null;

  const activityRows = await db
    .select()
    .from(companyNodeActivity)
    .where(eq(companyNodeActivity.nodeId, nodeId));
  activityRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    node: {
      ...buildCardData(node, byId, byParent),
      statusReason: node.statusReason,
      ownerName,
    },
    breadcrumb,
    children,
    canAddChild: depth < 3, // MVP: max. 3 úrovně (validateTreeDepth)
    activity: activityRows.map((row) => ({
      id: row.id,
      kind: row.kind as NodeActivityEntry["kind"],
      authorUserId: row.authorUserId,
      authorName: row.authorName,
      body: row.body,
      metadata: row.metadata,
      createdAt: row.createdAt,
    })),
  };
}

// Přepočítá a uloží stav u `nodeId`, pokud je v "auto" módu, a rekurzivně
// pokračuje k rodiči — zastaví se na prvním předkovi v "manual" módu
// (ruční pin) nebo v kořeni. Vždy zapíše (i "beze změny"), strom je na
// Begina měřítku malý, takže se tím nešetří nic podstatného a kód je
// jednodušší a méně náchylný na chyby v "žádná změna" detekci.
async function propagateStatusChange(nodeId: string): Promise<void> {
  const [node] = await db
    .select()
    .from(companyNodes)
    .where(eq(companyNodes.id, nodeId))
    .limit(1);
  if (!node || node.statusMode !== "auto") {
    return;
  }

  const children = await db
    .select({
      id: companyNodes.id,
      status: companyNodes.status,
      priority: companyNodes.priority,
      updatedAt: companyNodes.updatedAt,
    })
    .from(companyNodes)
    .where(and(eq(companyNodes.parentId, nodeId), isNull(companyNodes.archivedAt)));

  const statusChildren: StatusChild[] = children.map((c) => ({
    id: c.id,
    status: c.status as NodeStatus,
    priority: c.priority as NodePriority,
    updatedAt: c.updatedAt,
  }));

  const newStatus = computeAutoStatus(statusChildren);
  const driver = selectStatusDriver(statusChildren, newStatus);

  await db
    .update(companyNodes)
    .set({ status: newStatus, statusDriverNodeId: driver?.id ?? null, updatedAt: new Date() })
    .where(eq(companyNodes.id, nodeId));

  if (node.parentId) {
    await propagateStatusChange(node.parentId);
  }
}

export type NodeResult = { ok: true } | { ok: false; error: string };
export type CreateNodeResult = { ok: true; id: string } | { ok: false; error: string };

export async function createNode(
  parentId: string | null,
  rawInput: CreateNodeInput
): Promise<CreateNodeResult> {
  const ctx = await requireCompanyNodeContext();

  const validated = validateCreateNodeInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  let ancestorCount = 0;
  if (parentId) {
    const [parent] = await db
      .select({ id: companyNodes.id, parentId: companyNodes.parentId })
      .from(companyNodes)
      .where(and(eq(companyNodes.id, parentId), isNull(companyNodes.archivedAt)))
      .limit(1);
    if (!parent) {
      return { ok: false, error: "Nadřazený uzel nebyl nalezen." };
    }
    ancestorCount = 1;
    let current = parent;
    while (current.parentId) {
      ancestorCount += 1;
      const [next] = await db
        .select({ id: companyNodes.id, parentId: companyNodes.parentId })
        .from(companyNodes)
        .where(eq(companyNodes.id, current.parentId))
        .limit(1);
      if (!next) break;
      current = next;
    }
  }

  const depthCheck = validateTreeDepth(ancestorCount);
  if (!depthCheck.ok) {
    return { ok: false, error: depthCheck.error };
  }

  const id = randomUUID();
  await db.batch([
    db.insert(companyNodes).values({
      id,
      parentId,
      title: validated.value.title,
      description: validated.value.description,
      status: "green",
      statusMode: "auto",
      priority: validated.value.priority,
      createdBy: ctx.userId,
    }),
    db.insert(companyNodeActivity).values({
      nodeId: id,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "created",
    }),
  ]);

  if (parentId) {
    await propagateStatusChange(parentId);
  }

  return { ok: true, id };
}

export async function updateNodeStatus(
  nodeId: string,
  rawInput: UpdateStatusInput
): Promise<NodeResult> {
  const ctx = await requireCompanyNodeContext();

  const validated = validateStatusInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ status: companyNodes.status, parentId: companyNodes.parentId })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  await db.batch([
    db
      .update(companyNodes)
      .set({
        status: validated.value.status,
        statusMode: "manual",
        statusReason: validated.value.reason,
        statusDriverNodeId: null,
        updatedAt: new Date(),
      })
      .where(eq(companyNodes.id, nodeId)),
    db.insert(companyNodeActivity).values({
      nodeId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "status_changed",
      metadata: { from: current.status, to: validated.value.status, mode: "manual" },
    }),
  ]);

  if (current.parentId) {
    await propagateStatusChange(current.parentId);
  }

  return { ok: true };
}

// Vrátí uzel zpět do automatického režimu — okamžitě přepočítá stav
// z aktuálních dětí (computeAutoStatus([]) = "green", pokud žádné nemá).
export async function setNodeStatusAuto(nodeId: string): Promise<NodeResult> {
  const ctx = await requireCompanyNodeContext();

  const [current] = await db
    .select({ status: companyNodes.status, parentId: companyNodes.parentId })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  const children = await db
    .select({
      id: companyNodes.id,
      status: companyNodes.status,
      priority: companyNodes.priority,
      updatedAt: companyNodes.updatedAt,
    })
    .from(companyNodes)
    .where(and(eq(companyNodes.parentId, nodeId), isNull(companyNodes.archivedAt)));

  const statusChildren: StatusChild[] = children.map((c) => ({
    id: c.id,
    status: c.status as NodeStatus,
    priority: c.priority as NodePriority,
    updatedAt: c.updatedAt,
  }));
  const newStatus = computeAutoStatus(statusChildren);
  const driver = selectStatusDriver(statusChildren, newStatus);

  await db.batch([
    db
      .update(companyNodes)
      .set({
        status: newStatus,
        statusMode: "auto",
        statusReason: null,
        statusDriverNodeId: driver?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(companyNodes.id, nodeId)),
    db.insert(companyNodeActivity).values({
      nodeId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "status_changed",
      metadata: { from: current.status, to: newStatus, mode: "auto" },
    }),
  ]);

  if (current.parentId) {
    await propagateStatusChange(current.parentId);
  }

  return { ok: true };
}

export async function updateNodePriority(nodeId: string, rawPriority: string): Promise<NodeResult> {
  await requireCompanyNodeContext();

  const validated = validatePriorityInput(rawPriority);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [node] = await db
    .select({ parentId: companyNodes.parentId })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!node) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  await db
    .update(companyNodes)
    .set({ priority: validated.value, updatedAt: new Date() })
    .where(eq(companyNodes.id, nodeId));

  if (node.parentId) {
    await propagateStatusChange(node.parentId);
  }

  return { ok: true };
}

export async function addActivityComment(
  nodeId: string,
  rawInput: CommentInput
): Promise<NodeResult> {
  const ctx = await requireCompanyNodeContext();

  const validated = validateCommentInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [node] = await db
    .select({ id: companyNodes.id })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!node) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  await db.insert(companyNodeActivity).values({
    nodeId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "comment",
    body: validated.value.body,
  });

  return { ok: true };
}

// Nabídnutí se k převzetí — VŽDY vázané na skutečnou přihlášenou identitu
// (author_user_id), žádná textová identita. ADMIN/EXECUTIVE pak potvrdí
// nabídku tlačítkem, které zavolá assignOwner s tímhle author_user_id.
export async function offerClaim(nodeId: string, rawBody: string): Promise<NodeResult> {
  const ctx = await requireCompanyNodeContext();

  const validated = validateClaimInput(rawBody);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [node] = await db
    .select({ id: companyNodes.id })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!node) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  await db.insert(companyNodeActivity).values({
    nodeId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "claim_offered",
    body: validated.value || "Nabízí se k převzetí.",
  });

  return { ok: true };
}

// Přiřazení VÝHRADNĚ na skutečného Neon Auth uživatele — schváleno
// explicitně, žádný volný text pro jméno. Nikdy nemění status (nezávislé
// informace, viz specifikace).
export async function assignOwner(nodeId: string, ownerUserId: string): Promise<NodeResult> {
  const ctx = await requireCompanyNodeContext();

  const owner = await getUserProfile(ownerUserId);
  if (!owner) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [node] = await db
    .select({ id: companyNodes.id })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!node) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  await db.batch([
    db
      .update(companyNodes)
      .set({ ownerUserId, updatedAt: new Date() })
      .where(eq(companyNodes.id, nodeId)),
    db.insert(companyNodeActivity).values({
      nodeId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "owner_assigned",
      metadata: { ownerUserId, ownerName: owner.name ?? owner.email },
    }),
  ]);

  return { ok: true };
}

export async function unassignOwner(nodeId: string): Promise<NodeResult> {
  const ctx = await requireCompanyNodeContext();

  const [node] = await db
    .select({ id: companyNodes.id })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!node) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  await db.batch([
    db
      .update(companyNodes)
      .set({ ownerUserId: null, updatedAt: new Date() })
      .where(eq(companyNodes.id, nodeId)),
    db.insert(companyNodeActivity).values({
      nodeId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "owner_assigned",
      metadata: { ownerUserId: null },
    }),
  ]);

  return { ok: true };
}

export async function archiveNode(nodeId: string): Promise<NodeResult> {
  await requireCompanyNodeContext();

  const [node] = await db
    .select({ id: companyNodes.id, parentId: companyNodes.parentId })
    .from(companyNodes)
    .where(and(eq(companyNodes.id, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (!node) {
    return { ok: false, error: "Uzel nebyl nalezen." };
  }

  const [child] = await db
    .select({ id: companyNodes.id })
    .from(companyNodes)
    .where(and(eq(companyNodes.parentId, nodeId), isNull(companyNodes.archivedAt)))
    .limit(1);
  if (child) {
    return { ok: false, error: "Nejdřív archivujte podřízené uzly." };
  }

  await db
    .update(companyNodes)
    .set({ archivedAt: new Date() })
    .where(eq(companyNodes.id, nodeId));

  if (node.parentId) {
    await propagateStatusChange(node.parentId);
  }

  return { ok: true };
}
