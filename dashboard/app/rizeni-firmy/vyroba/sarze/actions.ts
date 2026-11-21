"use server";

import { revalidatePath } from "next/cache";
import { validateBatchInput } from "@/lib/vyroba/batches";
import { cancelBatch, createBatchFromWeb, setLineSoldOut, todayPrague } from "@/lib/vyroba/batchesServer";

export type BatchFormState = { error?: string; created?: { code: string; productName: string; notified: boolean } } | null;

export async function createBatchAction(_prev: BatchFormState, form: FormData): Promise<BatchFormState> {
  const lines = [3000, 650, 500, 200, 100].map((v) => ({
    volumeMl: v,
    quantity: form.get(`qty_${v}`) ? Number(form.get(`qty_${v}`)) : 0,
    bestBefore: (form.get(`bb_${v}`) as string | null) || null,
  }));
  const parsed = validateBatchInput(
    { productId: form.get("productId"), producedOn: form.get("producedOn"), lines, note: form.get("note") },
    todayPrague()
  );
  if (!parsed.ok) return { error: parsed.error };
  const result = await createBatchFromWeb(parsed.value);
  if (!result.ok) return { error: result.error };
  revalidatePath("/rizeni-firmy/vyroba/sarze");
  return { created: { code: result.batch.code, productName: result.batch.productName, notified: result.notified } };
}

export async function toggleSoldOutAction(lineId: string, soldOut: boolean): Promise<void> {
  await setLineSoldOut(lineId, soldOut);
  revalidatePath("/rizeni-firmy/vyroba/sarze");
}

export async function cancelBatchAction(batchId: string): Promise<void> {
  await cancelBatch(batchId);
  revalidatePath("/rizeni-firmy/vyroba/sarze");
}
