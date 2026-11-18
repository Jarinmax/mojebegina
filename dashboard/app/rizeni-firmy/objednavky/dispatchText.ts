import { formatCzechDateTime } from "@/lib/format";
import type { OrderCardData } from "@/lib/data/orders";

// Texty pro „Odesláno“ / „Faktura poslána“ (Lucie 18. 11. 2026) — počítají se
// na serveru (čas v Europe/Prague), klientská zaškrtávátka dostanou hotový text.

const shortDate = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric" });

/** „18. 11.“ */
export function shortPragueDate(date: Date): string {
  return shortDate.format(date).replace(/\s+/g, " ").trim();
}

export type DispatchView = {
  orderId: string;
  shipped: { done: boolean; title: string; lines: string[] };
  invoice: { done: boolean; title: string; lines: string[] };
  trackingNumber: string | null;
};

type DispatchSource = Pick<
  OrderCardData,
  | "id"
  | "shippedAt"
  | "shippedByName"
  | "invoiceSentAt"
  | "invoiceSentByName"
  | "invoiceSentTo"
  | "invoiceSentMethod"
  | "carrier"
  | "trackingNumber"
>;

export function dispatchView(order: DispatchSource): DispatchView {
  const shippedLines: string[] = [];
  if (order.shippedAt) {
    shippedLines.push(
      [formatCzechDateTime(order.shippedAt), order.shippedByName, order.carrier].filter(Boolean).join(" · ")
    );
    if (order.trackingNumber) shippedLines.push(`Číslo zásilky: ${order.trackingNumber}`);
  }
  const invoiceLines: string[] = [];
  if (order.invoiceSentAt) {
    invoiceLines.push(
      [
        formatCzechDateTime(order.invoiceSentAt),
        order.invoiceSentMethod === "email" ? "e-mailem z MojeBegina" : "ručně",
        order.invoiceSentMethod === "manual" ? order.invoiceSentByName : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
    if (order.invoiceSentTo) invoiceLines.push(`na ${order.invoiceSentTo}`);
  }
  return {
    orderId: order.id,
    shipped: { done: Boolean(order.shippedAt), title: "Odesláno", lines: shippedLines },
    invoice: { done: Boolean(order.invoiceSentAt), title: "Faktura poslána", lines: invoiceLines },
    trackingNumber: order.trackingNumber,
  };
}
