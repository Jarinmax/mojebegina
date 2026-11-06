"use server";

// Sklad 1.1 (hotové výrobky) — "use server" hranice pro mobilní formulář
// "Dokončit výrobu / Přijmout výrobky". Logika žije v
// lib/data/skladFinishedGoods.ts, tahle akce jen čte FormData a přesměruje
// — stejný princip jako app/rizeni-firmy/sklad/actions.ts.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { recordProductionBatch } from "@/lib/data/skladFinishedGoods";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export type ActionState = { error: string } | null;

function translateAuthError(error: unknown, forbiddenMessage: string): { ok: false; error: string } {
  if (error instanceof UnauthenticatedError) {
    return { ok: false, error: "Nepřihlášeno." };
  }
  if (error instanceof ForbiddenError) {
    return { ok: false, error: forbiddenMessage };
  }
  throw error;
}

export async function recordProductionBatchAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const quantity = Number(String(formData.get("quantity") ?? "").replace(",", "."));

  let result;
  try {
    result = await recordProductionBatch({
      stockItemId: String(formData.get("stockItemId") ?? ""),
      quantity,
      batchCode: String(formData.get("batchCode") ?? ""),
      producedAt: String(formData.get("producedAt") ?? ""),
      bestBeforeAt: String(formData.get("bestBeforeAt") ?? ""),
      stockLocationId: String(formData.get("stockLocationId") ?? ""),
      responsibleUserId: String(formData.get("responsibleUserId") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
  } catch (error) {
    return translateAuthError(error, "Nemáte oprávnění zapsat příjem výroby.");
  }

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/rizeni-firmy/sklad/stav");
  redirect(`/rizeni-firmy/sklad/vyroba?hotovo=${encodeURIComponent(result.batchCode)}`);
}
