"use server";

import { revalidatePath } from "next/cache";
import {
  addCollaboratorPayout,
  addCollaboratorProductMovement,
  addCollaboratorWorkEntry,
  assignLucieCardByEmail,
  deleteCollaboratorWorkEntry,
  inviteLucieCollaborator,
  updateCollaboratorWorkEntry,
} from "@/lib/data/collaboratorCards";

export type CollaboratorActionState = { error: string } | { success: string } | null;

const path = "/spoluprace/lucie";

export async function addWorkEntryAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await addCollaboratorWorkEntry({
      description: formData.get("description"),
      postCount: formData.get("postCount"),
      durationMinutes: formData.get("durationMinutes"),
      rewardType: formData.get("rewardType"),
      rateKc: formData.get("rateKc"),
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

export async function updateWorkEntryAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await updateCollaboratorWorkEntry({
      id: formData.get("id"),
      description: formData.get("description"),
      postCount: formData.get("postCount"),
      durationMinutes: formData.get("durationMinutes"),
      rewardType: formData.get("rewardType"),
      rateKc: formData.get("rateKc"),
      occurredOn: formData.get("occurredOn"),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: "Záznam byl upraven." };
  } catch (error) {
    console.error("updateWorkEntryAction", error);
    return { error: "Záznam se nepodařilo upravit." };
  }
}

export async function deleteWorkEntryAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await deleteCollaboratorWorkEntry({ id: formData.get("id") });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: "Záznam byl smazán." };
  } catch (error) {
    console.error("deleteWorkEntryAction", error);
    return { error: "Záznam se nepodařilo smazat." };
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

export async function inviteCollaboratorAction(_prev: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  try {
    const result = await inviteLucieCollaborator({ name: formData.get("name"), email: formData.get("email") });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: `Pozvánka byla odeslána na ${result.email}.` };
  } catch (error) {
    console.error("inviteCollaboratorAction", error);
    return { error: "Spolupracovnici se nepodařilo pozvat." };
  }
}

