"use server";

// Jardova karta — zápis výplaty odměny. Oprávnění (jen vedoucí) ověřuje
// datová vrstva (lib/data/jardaRewards.ts) sama.
import { revalidatePath } from "next/cache";
import { addJardaTrustEntry, cancelJardaTrustEntry, setJardaRecurring } from "@/lib/data/jardaTrust";
import { addJardaPayout, cancelRewardAssignment, confirmRewardAssignment } from "@/lib/data/jardaRewards";

export type PayoutActionState = { error: string } | { success: string } | null;

export async function addJardaPayoutAction(_prev: PayoutActionState, formData: FormData): Promise<PayoutActionState> {
  try {
    const result = await addJardaPayout({
      amountKc: Number(formData.get("amountKc") ?? 0),
      note: String(formData.get("note") ?? ""),
      paidOn: String(formData.get("paidOn") ?? ""),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/prace/odmeny");
    return { success: "Výplata zapsána." };
  } catch (error) {
    console.error("addJardaPayoutAction", error);
    return { error: "Výplatu se nepodařilo zapsat." };
  }
}

// Návrhy typu zákazníka od Jardy — potvrdit / zamítnout (jen vedoucí; ověřuje datová vrstva).
export async function confirmProposalAction(leadId: string): Promise<void> {
  await confirmRewardAssignment(leadId);
  revalidatePath("/prace/odmeny");
  revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
}

export async function rejectProposalAction(leadId: string): Promise<void> {
  await cancelRewardAssignment(leadId);
  revalidatePath("/prace/odmeny");
  revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
}

// --- Svěřené peníze (Jarda, Viner, Lucie; zapisují Viner a Lucie) -------------

export type TrustActionState = { error: string } | { success: string } | null;

export async function addTrustEntryAction(_prev: TrustActionState, formData: FormData): Promise<TrustActionState> {
  try {
    const result = await addJardaTrustEntry({
      kind: String(formData.get("kind") ?? ""),
      amountKc: Number(formData.get("amountKc") ?? 0),
      entryDate: String(formData.get("entryDate") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/prace/odmeny");
    return { success: "Zapsáno." };
  } catch (error) {
    console.error("addTrustEntryAction", error);
    return { error: "Záznam se nepodařilo uložit." };
  }
}

export async function setRecurringAction(_prev: TrustActionState, formData: FormData): Promise<TrustActionState> {
  try {
    const result = await setJardaRecurring({
      label: String(formData.get("label") ?? ""),
      amountKc: Number(formData.get("amountKc") ?? 0),
      dayOfMonth: Number(formData.get("dayOfMonth") ?? 0),
      fromMonth: String(formData.get("fromMonth") ?? ""),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/prace/odmeny");
    return { success: "Pravidelná platba uložena." };
  } catch (error) {
    console.error("setRecurringAction", error);
    return { error: "Pravidelnou platbu se nepodařilo uložit." };
  }
}

export async function cancelTrustEntryAction(entryId: string): Promise<void> {
  await cancelJardaTrustEntry(entryId);
  revalidatePath("/prace/odmeny");
}
