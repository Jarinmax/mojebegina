"use server";

import { revalidatePath } from "next/cache";
import { assignDocument, removeDocument } from "@/lib/doklady/documents";

export async function assignDocumentAction(documentId: string, formData: FormData): Promise<void> {
  const entryId = String(formData.get("entryId") ?? "");
  await assignDocument(documentId, entryId || null);
  revalidatePath("/rizeni-firmy/doklady");
}

export async function unassignDocumentAction(documentId: string): Promise<void> {
  await assignDocument(documentId, null);
  revalidatePath("/rizeni-firmy/doklady");
}

export async function removeDocumentAction(documentId: string): Promise<void> {
  await removeDocument(documentId);
  revalidatePath("/rizeni-firmy/doklady");
}
