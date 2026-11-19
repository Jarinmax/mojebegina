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

/** Políčko souhrnné tabulky (19. 11. 2026, Jarin): přepne všechny položky jednoho produktu v jedné objednávce. */
export async function toggleCellProducedAction(
  orderId: string,
  itemIds: string[],
  produced: boolean,
  _prev: ProducedState
): Promise<ProducedState> {
  for (const itemId of itemIds) {
    const result = await setItemProduced(itemId, produced);
    if (!result.ok) {
      revalidatePath("/rizeni-firmy/vyroba");
      return { error: result.error };
    }
  }
  revalidatePath("/rizeni-firmy/vyroba");
  revalidatePath(`/rizeni-firmy/vyroba/${orderId}`);
  revalidatePath(`/rizeni-firmy/objednavky/${orderId}`);
  revalidatePath("/rizeni-firmy/objednavky");
  return null;
}
