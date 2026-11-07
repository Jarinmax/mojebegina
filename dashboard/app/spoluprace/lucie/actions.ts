"use server";

import { revalidatePath } from "next/cache";
import {
  addCollaboratorPayout,
  addCollaboratorProductMovement,
  addCollaboratorWorkEntry,
  assignLucieCardByEmail,
} from "@/lib/data/collaboratorCards";

export type CollaboratorActionState = { error: string } | { success: string } | null;

const path = "/spoluprace/lucie";

export async function addWorkEntryAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await addCollaboratorWorkEntry({
      description: formData.get("description"),
      postCount: formData.get("postCount"),
      durationMinutes: formData.get("durationMinutes"),
      earnedKc: formData.get("earnedKc"),
      occurredOn: formData.get("occurredOn"),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: "Práce byla zapsána." };
  } catch (error) {
    console.error("addWorkEntryAction", error);
    return { error: "Práci se nepodařilo zapsat." };
  }
}

export async function addProductMovementAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await addCollaboratorProductMovement({
      productId: formData.get("productId"),
      kind: formData.get("kind"),
      quantity: formData.get("quantity"),
      unitSalePriceKc: formData.get("unitSalePriceKc") || undefined,
      note: formData.get("note") || undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: formData.get("kind") === "sale" ? "Prodej byl zapsán." : "Příjem na sklad byl zapsán." };
  } catch (error) {
    console.error("addProductMovementAction", error);
    return { error: "Pohyb produktu se nepodařilo zapsat." };
  }
}

export async function addPayoutAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await addCollaboratorPayout({ amountKc: formData.get("amountKc"), note: formData.get("note") || undefined });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: "Výplata byla zapsána." };
  } catch (error) {
    console.error("addPayoutAction", error);
    return { error: "Výplatu se nepodařilo zapsat." };
  }
}

export async function assignCardAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await assignLucieCardByEmail({ email: formData.get("email") });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: `Karta byla přiřazena účtu ${result.profile.email}.` };
  } catch (error) {
    console.error("assignCardAction", error);
    return { error: "Kartu se nepodařilo přiřadit." };
  }
}

