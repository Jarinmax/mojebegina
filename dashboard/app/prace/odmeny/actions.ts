"use server";

// Jardova karta — zápis výplaty odměny. Oprávnění (jen vedoucí) ověřuje
// datová vrstva (lib/data/jardaRewards.ts) sama.
import { revalidatePath } from "next/cache";
import { addJardaPayout } from "@/lib/data/jardaRewards";

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
