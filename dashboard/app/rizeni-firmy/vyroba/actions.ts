"use server";

import { revalidatePath } from "next/cache";
import { setItemProduced } from "@/lib/data/productionBoard";

export type ProducedState = { error?: string } | null;

export async function toggleProducedAction(
  orderId: string,
  itemId: string,
  produced: boolean,
  _prev: ProducedState
): Promise<ProducedState> {
  const result = await setItemProduced(itemId, produced);
  revalidatePath("/rizeni-firmy/vyroba");
  revalidatePath(`/rizeni-firmy/vyroba/${orderId}`);
  revalidatePath(`/rizeni-firmy/objednavky/${orderId}`);
  revalidatePath("/rizeni-firmy/objednavky");
  return result.ok ? null : { error: result.error };
}
