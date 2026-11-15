"use server";

// Evidence typu odměňování prodejce (bod 4 dohody). Oprávnění ověřuje
// datová vrstva (lib/data/jardaRewards.ts).
import { revalidatePath } from "next/cache";
import { cancelRewardAssignment, recordRewardAssignment } from "@/lib/data/jardaRewards";

export type RewardFormState = { error: string } | { success: string } | null;

export async function recordRewardAssignmentAction(leadId: string, _prev: RewardFormState, formData: FormData): Promise<RewardFormState> {
  try {
    const result = await recordRewardAssignment({
      leadId,
      type: String(formData.get("rewardType") ?? ""),
      productIds: formData.getAll("productIds").map(String),
      note: String(formData.get("note") ?? ""),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
    return { success: "Typ odměňování je zaevidovaný." };
  } catch (error) {
    console.error("recordRewardAssignmentAction", error);
    return { error: "Evidenci se nepodařilo uložit." };
  }
}

export async function cancelRewardAssignmentAction(leadId: string, _prev: RewardFormState): Promise<RewardFormState> {
  try {
    const result = await cancelRewardAssignment(leadId);
    if (!result.ok) return { error: result.error };
    revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
    return { success: "Evidence zrušena." };
  } catch (error) {
    console.error("cancelRewardAssignmentAction", error);
    return { error: "Evidenci se nepodařilo zrušit." };
  }
}
