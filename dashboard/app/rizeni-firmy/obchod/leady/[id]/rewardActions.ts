"use server";

// Typ zákazníka podle dohody o odměňování (bod 4): Jarda navrhne, vedení
// potvrdí/zamítne. Oprávnění ověřuje datová vrstva (lib/data/jardaRewards.ts).
import { revalidatePath } from "next/cache";
import { cancelRewardAssignment, confirmRewardAssignment, recordRewardAssignment } from "@/lib/data/jardaRewards";

export type RewardFormState = { error: string } | { success: string } | null;

const refresh = (leadId: string) => {
  revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
  revalidatePath("/prace/odmeny");
};

export async function recordRewardAssignmentAction(leadId: string, _prev: RewardFormState, formData: FormData): Promise<RewardFormState> {
  try {
    const result = await recordRewardAssignment({
      leadId,
      type: String(formData.get("rewardType") ?? ""),
      productIds: formData.getAll("productIds").map(String),
      note: String(formData.get("note") ?? ""),
    });
    if (!result.ok) return { error: result.error };
    refresh(leadId);
    return { success: "Uloženo." };
  } catch (error) {
    console.error("recordRewardAssignmentAction", error);
    return { error: "Nepodařilo se uložit." };
  }
}

export async function confirmRewardAssignmentAction(leadId: string, _prev: RewardFormState): Promise<RewardFormState> {
  try {
    const result = await confirmRewardAssignment(leadId);
    if (!result.ok) return { error: result.error };
    refresh(leadId);
    return { success: "Potvrzeno." };
  } catch (error) {
    console.error("confirmRewardAssignmentAction", error);
    return { error: "Nepodařilo se potvrdit." };
  }
}

export async function cancelRewardAssignmentAction(leadId: string, _prev: RewardFormState): Promise<RewardFormState> {
  try {
    const result = await cancelRewardAssignment(leadId);
    if (!result.ok) return { error: result.error };
    refresh(leadId);
    return { success: "Hotovo." };
  } catch (error) {
    console.error("cancelRewardAssignmentAction", error);
    return { error: "Nepodařilo se provést." };
  }
}
