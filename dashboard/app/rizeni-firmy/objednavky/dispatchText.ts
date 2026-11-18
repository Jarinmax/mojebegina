import { formatCzechDate, formatCzechDateTime } from "@/lib/format";
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
  /** datum odeslání pro formulář (RRRR-MM-DD, Europe/Prague) */
  shippedOn: string | null;
  /** dnešek pro výchozí hodnotu a max (RRRR-MM-DD, Europe/Prague) */
  today: string;
};

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

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
      [`odesláno ${formatCzechDate(order.shippedAt)}`, order.shippedByName, order.carrier].filter(Boolean).join(" · ")
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
    shippedOn: order.shippedAt ? ymd.format(order.shippedAt) : null,
    today: ymd.format(new Date()),
  };
}
