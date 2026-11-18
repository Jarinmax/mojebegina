"use server";

// Security Phase 17 (CEO přehled 1.0) — sdílená "use server" hranice pro
// tuhle doménu. Logika žije v lib/data/ceoFocus.ts, stejný princip jako
// app/rizeni-firmy/obchod/actions.ts.
import { revalidatePath } from "next/cache";
import {
  createFocusProject,
  updateFocusProject,
  assignFocusOwner,
  setActiveFocusProject,
  clearActiveFocusProject,
} from "@/lib/data/ceoFocus";

export type ActionState = { error: string } | { success: string } | null;

function revalidateCeoFocus(projectId?: string) {
  revalidatePath("/rizeni-firmy/ceo");
  if (projectId) {
    revalidatePath(`/rizeni-firmy/ceo/${projectId}`);
  }
}

export async function createFocusProjectAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await createFocusProject(String(formData.get("title") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCeoFocus();
  return { success: "Projekt byl založen." };
}

export async function updateFocusProjectAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateFocusProject(projectId, {
    note: String(formData.get("note") ?? ""),
    status: String(formData.get("status") ?? ""),
    statusReason: String(formData.get("statusReason") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    description: String(formData.get("description") ?? ""),
    nextStep: String(formData.get("nextStep") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCeoFocus(projectId);
  return { success: "Aktualizace byla uložena." };
}

export async function assignFocusOwnerAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ownerUserId = String(formData.get("ownerUserId") ?? "");
  if (!ownerUserId) {
    return { error: "Vyberte, kdo je na tahu." };
  }

  const result = await assignFocusOwner(projectId, ownerUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCeoFocus(projectId);
  return { success: "Přiřazeno." };
}

export async function setActiveFocusProjectAction(projectId: string): Promise<void> {
  await setActiveFocusProject(projectId);
  revalidateCeoFocus(projectId);
}

export async function clearActiveFocusProjectAction(projectId: string): Promise<void> {
  await clearActiveFocusProject(projectId);
  revalidateCeoFocus(projectId);
}
