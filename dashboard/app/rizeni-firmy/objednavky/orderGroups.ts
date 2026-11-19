import type { OrderCardData } from "@/lib/data/orders";

// Seznam objednávek po skupinách (Lucie 19. 11. 2026): nahoře červeně, co
// čeká na vyřízení (nejstarší první), pod tím na cestě, dole zeleně
// doručené, úplně dole stornované.
export type OrderGroup = "todo" | "onTheWay" | "done" | "cancelled";

export function orderGroup(o: Pick<OrderCardData, "fulfillmentStatus" | "shippedAt">): OrderGroup {
  if (o.fulfillmentStatus === "cancelled") return "cancelled";
  if (o.fulfillmentStatus === "delivered") return "done";
  if (o.fulfillmentStatus === "handed_to_carrier" || o.fulfillmentStatus === "out_for_delivery" || o.shippedAt) return "onTheWay";
  return "todo";
}

export const GROUP_META: Record<OrderGroup, { title: string; card: string; heading: string }> = {
  todo: { title: "Čeká na vyřízení", card: "bg-red-50 border-red-300 border-l-4 border-l-red-500", heading: "text-red-700" },
  onTheWay: { title: "Odesláno — na cestě", card: "bg-amber-50 border-amber-200 border-l-4 border-l-amber-400", heading: "text-amber-700" },
  done: { title: "Hotovo — doručeno", card: "bg-emerald-50 border-emerald-200 border-l-4 border-l-emerald-500", heading: "text-emerald-700" },
  cancelled: { title: "Zrušené", card: "bg-neutral-50 border-neutral-200", heading: "text-neutral-500" },
};

const ORDER: OrderGroup[] = ["todo", "onTheWay", "done", "cancelled"];

export function groupOrders(orders: OrderCardData[]): { group: OrderGroup; orders: OrderCardData[] }[] {
  return ORDER.map((group) => {
    const list = orders.filter((o) => orderGroup(o) === group);
    // čekající: nejstarší nahoře (nejdéle čeká); ostatní: nejnovější nahoře
    if (group === "todo") list.sort((a, b) => a.orderedAt.getTime() - b.orderedAt.getTime());
    return { group, orders: list };
  }).filter((g) => g.orders.length > 0);
}
