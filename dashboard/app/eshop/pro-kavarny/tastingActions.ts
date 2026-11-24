"use server";

// Vzorky k první begině (24. 11. 2026): nárok na dárek se ověřuje podle e-mailu
// (dřív IČO a ARES). Pokladna se zeptá, jakmile zákazník vyplní e-mail.
import { db } from "@/lib/db/client";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { cafeTastingGiftAvailable } from "@/lib/eshop/cafeTastingServer";

/** true = vzorky zdarma k první begině ještě nečerpal (nebo to nejde zjistit). */
export async function checkTastingGiftAction(email: string): Promise<boolean> {
  if (!isEshopPublic()) return true;
  const trimmed = email.trim().slice(0, 254);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return true;
  return (await cafeTastingGiftAvailable(db, trimmed)) !== false;
}
