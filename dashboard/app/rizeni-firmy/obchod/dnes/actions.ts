"use server";

// Security Phase 19 (Denní volání 1.0) — sdílená "use server" hranice,
// stejný princip jako ../actions.ts. Logika žije v lib/data/dailyCalls.ts.
import { revalidatePath } from "next/cache";
import {
  generateDraftCandidates,
  addManualCandidate,
  removeQueueItem,
  publishDraft,
  moveQueueItemUp,
  moveQueueItemDown,
  logDailyCallOutcome,
} from "@/lib/data/dailyCalls";

export type ActionState = { error: string } | { success: string } | null;

function revalidateDailyCalls() {
  revalidatePath("/rizeni-firmy/obchod/dnes");
}

export async function generateDraftCandidatesAction(): Promise<void> {
  await generateDraftCandidates();
  revalidateDailyCalls();
}

export async function addManualCandidateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) {
    return { error: "Vyberte lead k přidání." };
  }

  const result = await addManualCandidate(leadId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateDailyCalls();
  return { success: "Lead byl přidán do návrhu." };
}

export async function removeQueueItemAction(itemId: string): Promise<void> {
  await removeQueueItem(itemId);
  revalidateDailyCalls();
}

export async function publishDraftAction(): Promise<void> {
  await publishDraft();
  revalidateDailyCalls();
}

export async function moveQueueItemUpAction(itemId: string): Promise<void> {
  await moveQueueItemUp(itemId);
  revalidateDailyCalls();
}

export async function moveQueueItemDownAction(itemId: string): Promise<void> {
  await moveQueueItemDown(itemId);
  revalidateDailyCalls();
}

export async function logDailyCallOutcomeAction(
  itemId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await logDailyCallOutcome(itemId, {
    result: String(formData.get("result") ?? ""),
    note: String(formData.get("note") ?? ""),
    stageChange: String(formData.get("stageChange") ?? ""),
    nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateDailyCalls();
  return { success: "Výsledek hovoru byl uložen." };
}
