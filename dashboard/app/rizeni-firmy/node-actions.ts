"use server";

// Security Phase 12 (Řízení firmy 2.0) — sdílená "use server" hranice pro
// všechny akce nad uzly živé mapy. Logika (autorizace, validace, DB,
// propagace stavu) žije v lib/data/companyNodes.ts, stejný princip jako
// app/admin/organizace/[id]/actions.ts. Jeden soubor pro celou funkci, ne
// per-route, protože formuláře (CreateNodeForm) se používají jak na
// /rizeni-firmy (Oblasti), tak na /rizeni-firmy/uzel/[id] (podřízené uzly).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createNode,
  updateNodeStatus,
  setNodeStatusAuto,
  updateNodePriority,
  addActivityComment,
  offerClaim,
  assignOwner,
  unassignOwner,
  archiveNode,
} from "@/lib/data/companyNodes";

export type ActionState = { error: string } | { success: string } | null;

function revalidateNode(parentId: string | null, nodeId?: string) {
  revalidatePath("/rizeni-firmy");
  if (parentId) {
    revalidatePath(`/rizeni-firmy/uzel/${parentId}`);
  }
  if (nodeId) {
    revalidatePath(`/rizeni-firmy/uzel/${nodeId}`);
  }
}

export async function createNodeAction(
  parentId: string | null,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await createNode(parentId, {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    priority: String(formData.get("priority") ?? "medium"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateNode(parentId, result.id);
  return { success: "Uzel byl vytvořen." };
}

export async function updateNodeStatusAction(
  nodeId: string,
  parentId: string | null,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateNodeStatus(nodeId, {
    status: String(formData.get("status") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateNode(parentId, nodeId);
  return { success: "Stav byl uložen." };
}

export async function setNodeStatusAutoAction(
  nodeId: string,
  parentId: string | null,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _formData;

  const result = await setNodeStatusAuto(nodeId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateNode(parentId, nodeId);
  return { success: "Stav se teď počítá automaticky." };
}

export async function updateNodePriorityAction(
  nodeId: string,
  parentId: string | null,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateNodePriority(nodeId, String(formData.get("priority") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateNode(parentId, nodeId);
  return { success: "Priorita byla uložena." };
}

export async function addActivityCommentAction(
  nodeId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await addActivityComment(nodeId, { body: String(formData.get("body") ?? "") });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/rizeni-firmy/uzel/${nodeId}`);
  return { success: "Komentář byl přidán." };
}

export async function offerClaimAction(
  nodeId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await offerClaim(nodeId, String(formData.get("body") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/rizeni-firmy/uzel/${nodeId}`);
  return { success: "Nabídka byla zaznamenána." };
}

// Volá se buď z detailu uzlu s ownerUserId zadaným ADMIN/EXECUTIVE (mimo
// MVP UI, viz report), nebo — v MVP UI — přímo z timeline u konkrétní
// nabídky (claim_offered), s ownerUserId = author té nabídky.
export async function assignOwnerAction(
  nodeId: string,
  ownerUserId: string,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _formData;

  const result = await assignOwner(nodeId, ownerUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/rizeni-firmy/uzel/${nodeId}`);
  return { success: "Odpovědná osoba byla přiřazena." };
}

export async function unassignOwnerAction(
  nodeId: string,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _formData;

  const result = await unassignOwner(nodeId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/rizeni-firmy/uzel/${nodeId}`);
  return { success: "Vlastník byl odebrán." };
}

export async function archiveNodeAction(
  nodeId: string,
  parentId: string | null,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _formData;

  const result = await archiveNode(nodeId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateNode(parentId);
  redirect(parentId ? `/rizeni-firmy/uzel/${parentId}` : "/rizeni-firmy");
}
