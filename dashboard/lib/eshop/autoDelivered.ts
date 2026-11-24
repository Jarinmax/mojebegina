// Automatické „Doručená“ (Lucie 24. 11. 2026): CoolBalík doručení nehlásí,
// takže objednávky visely jako „Odesláno – na cestě“ a neodcházela ani žádost
// o hodnocení (ta jde 7 dní po Doručeno). Objednávka ve stavu „Předáno
// přepravci“ se proto sama přepne na „Doručená“ 2 pracovní dny po odeslání
// (CoolBalík vozí do druhého dne). Vlastní rozvoz („Na rozvozu“) se nepřepíná.
import { addCzWorkdays } from "@/lib/czWorkdays";

export const AUTO_DELIVERED_WORKDAYS = 2;

const pragueYmd = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });

/** Je už den, kdy se má objednávka odeslaná `shippedAt` přepnout na Doručená? */
export function isAutoDeliveredDue(shippedAt: Date, now: Date): boolean {
  const due = addCzWorkdays(shippedAt, AUTO_DELIVERED_WORKDAYS).toISOString().slice(0, 10);
  return pragueYmd.format(now) >= due;
}
