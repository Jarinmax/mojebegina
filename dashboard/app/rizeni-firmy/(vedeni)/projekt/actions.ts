"use server";

// PROJEKT BEGINA 1.0 — zápis a smazání stavu, rozhodnutí a výstupu.
// Jen Jaroslav a Lucie (isInvoiceIssuer).
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { validateProjectInput } from "@/lib/projekt/areas";
import { insertProjectEntry, softDeleteProjectEntry } from "@/lib/projekt/projectServer";

export type ProjectActionState = { error: string } | { success: string } | null;

const DENIED = "Projekt Begina smí vidět a upravovat jen Jaroslav Viner a Lucie Königsbergová.";
const BASE = "/rizeni-firmy/projekt";

async function requireOwner() {
  const ctx = await getAuthContext();
  return ctx && isInvoiceIssuer(ctx) ? ctx : null;
}

export async function addProjectEntryAction(_prev: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const ctx = await requireOwner();
  if (!ctx) return { error: DENIED };
  const parsed = validateProjectInput({
    area: formData.get("area"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    body: formData.get("body"),
    url: formData.get("url"),
  });
  if (!parsed.ok) return { error: parsed.error };
  await insertProjectEntry(parsed.value, { userId: ctx.userId, name: ctx.name, source: "manual" });
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${parsed.value.area}`);
  return { success: parsed.value.kind === "status" ? "Stav uložen." : parsed.value.kind === "decision" ? "Rozhodnutí zapsáno." : "Výstup přidán." };
}

export async function deleteProjectEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireOwner();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await softDeleteProjectEntry(id);
  revalidatePath(BASE);
  const area = String(formData.get("area") ?? "");
  if (/^[a-z-]{2,30}$/.test(area)) revalidatePath(`${BASE}/${area}`);
}
