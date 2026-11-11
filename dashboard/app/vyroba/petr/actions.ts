"use server";

import { revalidatePath } from "next/cache";
import {
  addProductionStockRequest,
  assignProductionCardByEmail,
  inviteProductionCollaborator,
  resolveProductionStockRequest,
} from "@/lib/data/productionCard";

export type ProductionActionState = { error: string } | { success: string } | null;

const path = "/vyroba/petr";

export async function addStockRequestAction(_prev: ProductionActionState, formData: FormData): Promise<ProductionActionState> {
  try {
    const result = await addProductionStockRequest({
      stockItemId: formData.get("stockItemId") || undefined,
      note: formData.get("note"),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: "Žádost byla zapsána." };
  } catch (error) {
    console.error("addStockRequestAction", error);
    return { error: "Žádost se nepodařilo zapsat." };
  }
}

export async function resolveStockRequestAction(_prev: ProductionActionState, formData: FormData): Promise<ProductionActionState> {
  try {
    const result = await resolveProductionStockRequest(formData.get("requestId"));
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: "Žádost byla označena jako vyřízená." };
  } catch (error) {
    console.error("resolveStockRequestAction", error);
    return { error: "Žádost se nepodařilo vyřídit." };
  }
}

export async function assignProductionCardAction(_prev: ProductionActionState, formData: FormData): Promise<ProductionActionState> {
  try {
    const result = await assignProductionCardByEmail({ email: formData.get("email") });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: `Karta byla přiřazena účtu ${result.profile.email}.` };
  } catch (error) {
    console.error("assignProductionCardAction", error);
    return { error: "Kartu se nepodařilo přiřadit." };
  }
}

export async function inviteProductionCollaboratorAction(_prev: ProductionActionState, formData: FormData): Promise<ProductionActionState> {
  try {
    const result = await inviteProductionCollaborator({ name: formData.get("name"), email: formData.get("email") });
    if (!result.ok) return { error: result.error };
    revalidatePath(path);
    return { success: `Pozvánka byla odeslána na ${result.email}.` };
  } catch (error) {
    console.error("inviteProductionCollaboratorAction", error);
    return { error: "Do výroby se nepodařilo pozvat." };
  }
}
