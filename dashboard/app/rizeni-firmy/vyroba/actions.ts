"use server";

import { completeHandover, parseHandover } from "@/lib/data/orderHandover";
import { revalidatePath } from "next/cache";
import { setDeliveryAddress, setItemProduced } from "@/lib/data/productionBoard";

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

export type AddressState = { error?: string; saved?: boolean } | null;

/** Doplnění / oprava doručovací adresy z karty výroby. */
export async function setDeliveryAddressAction(orderId: string, _prev: AddressState, formData: FormData): Promise<AddressState> {
  const result = await setDeliveryAddress(orderId, String(formData.get("address") ?? ""));
  revalidatePath("/rizeni-firmy/vyroba");
  revalidatePath(`/rizeni-firmy/vyroba/${orderId}`);
  revalidatePath(`/rizeni-firmy/objednavky/${orderId}`);
  return result.ok ? { saved: true } : { error: result.error };
}

export type HandoverState = { error?: string; success?: string } | null;

/** Předání z výrobní karty: jak předáno + jak se platí (Lucie 26. 11. 2026). */
export async function handoverAction(orderId: string, _prev: HandoverState, formData: FormData): Promise<HandoverState> {
  const parsed = parseHandover(String(formData.get("mode") ?? ""), String(formData.get("payment") ?? ""));
  if ("error" in parsed) return { error: parsed.error };
  const result = await completeHandover(orderId, parsed.mode, parsed.payment, String(formData.get("shippedOn") ?? ""));
  revalidatePath("/rizeni-firmy/vyroba");
  revalidatePath(`/rizeni-firmy/vyroba/${orderId}`);
  revalidatePath(`/rizeni-firmy/objednavky/${orderId}`);
  revalidatePath("/rizeni-firmy/objednavky");
  if (!result.ok) return { error: result.error };
  return { success: "Uloženo." };
}
