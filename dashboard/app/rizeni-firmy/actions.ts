"use server";

// Security Phase 10 (Řízení firmy 1.0) — "use server" hranice pro zápis
// zápisů ze schůzek. Logika (autorizace, validace, DB) žije v
// lib/data/companyManagement.ts, stejný princip jako
// app/admin/organizace/[id]/actions.ts.
import { revalidatePath } from "next/cache";
import { addCompanyNote } from "@/lib/data/companyManagement";

export type ActionState = { error: string } | { success: string } | null;

export async function addCompanyNoteAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await addCompanyNote({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/rizeni-firmy");
  return { success: "Zápis byl uložen." };
}
