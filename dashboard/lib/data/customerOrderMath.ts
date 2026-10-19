// Partnerský program — měsíční obrat zákazníka (čistá funkce, bez DB).
import type { Order } from "@/mock/customer";

function formatMonthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

// Stejné pravidlo jako dřív v mock/customer.ts: počítá se jen uhrazená
// hodnota zboží za AKTUÁLNÍ kalendářní měsíc (podle hodin serveru), ne
// napevno zapsaný měsíc.
export function getCurrentMonthlyPurchase(customerOrders: Order[]): number {
  const monthKey = formatMonthKey(new Date());
  return customerOrders
    .filter((order) => order.monthKey === monthKey)
    .reduce((sum, order) => sum + order.totalKc, 0);
}
