// POKLADNA BISTRA (Lucie 26. 11. 2026) — čisté funkce bez I/O: součty účtu,
// číslo účtenky, variabilní symbol pro QR platbu, souhrn dne a měsíce.
// Částky vždy v haléřích (celá čísla).

export type PosPaymentMethod = "cash" | "card" | "qr";

export const PAYMENT_LABELS: Record<PosPaymentMethod, string> = {
  cash: "Hotově",
  card: "Kartou",
  qr: "QR platba",
};

export function isPaymentMethod(value: unknown): value is PosPaymentMethod {
  return value === "cash" || value === "card" || value === "qr";
}

/** Výchozí kategorie menu (pořadí dlaždic); vlastní kategorie jdou za ně. */
export const DEFAULT_CATEGORIES = ["Polévky", "Hlavní jídla", "Dezerty a zmrzlina", "Nápoje", "Káva a čaj", "Alkohol", "Beginy s sebou"];

export type CartLine = { itemId: string; name: string; unitPriceHal: number; quantity: number };

export function lineTotal(line: Pick<CartLine, "unitPriceHal" | "quantity">): number {
  return line.unitPriceHal * line.quantity;
}

export function cartTotal(lines: Array<Pick<CartLine, "unitPriceHal" | "quantity">>): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

/** Přidá / ubere kus; množství 0 položku odstraní. */
export function changeQuantity(lines: CartLine[], item: Omit<CartLine, "quantity">, delta: number): CartLine[] {
  const existing = lines.find((l) => l.itemId === item.itemId);
  if (!existing) return delta > 0 ? [...lines, { ...item, quantity: delta }] : lines;
  const quantity = existing.quantity + delta;
  return quantity <= 0 ? lines.filter((l) => l.itemId !== item.itemId) : lines.map((l) => (l.itemId === item.itemId ? { ...l, quantity } : l));
}

/** Kolik vrátit při platbě hotově; null = zákazník dal málo. */
export function changeDue(totalHal: number, givenHal: number): number | null {
  return givenHal >= totalHal ? givenHal - totalHal : null;
}

/** „2026/000123“ — pořadové číslo účtenky (EET: pořadové číslo tržby). */
export function receiptNumber(year: number, seq: number): string {
  return `${year}/${String(seq).padStart(6, "0")}`;
}

/** VS pro QR platbu u stolu: „9“ + RR + pořadí (7 číslic) = 10 číslic, v roce jedinečné. */
export function posVariableSymbol(year: number, seq: number): string {
  return `9${String(year % 100).padStart(2, "0")}${String(seq).padStart(7, "0")}`;
}

/** „1 250 Kč“, „349,90 Kč“ */
export function formatKc(hal: number): string {
  const kc = hal / 100;
  return `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: Number.isInteger(kc) ? 0 : 2, maximumFractionDigits: 2 }).format(kc)} Kč`;
}

/** Vstup ceny „129“ / „129,50“ → haléře; null = neplatné. */
export function parsePriceToHal(raw: string): number | null {
  const cleaned = raw.replace(/\s|Kč/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const hal = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(hal) && hal >= 0 ? hal : null;
}

export type DayReceipt = { paymentMethod: PosPaymentMethod; totalHal: number; cancelled: boolean };
export type DaySummary = { cashHal: number; cardHal: number; qrHal: number; totalHal: number; receiptCount: number; cancelledCount: number };

export function summarizeDay(receipts: DayReceipt[]): DaySummary {
  const summary: DaySummary = { cashHal: 0, cardHal: 0, qrHal: 0, totalHal: 0, receiptCount: 0, cancelledCount: 0 };
  for (const r of receipts) {
    if (r.cancelled) {
      summary.cancelledCount += 1;
      continue;
    }
    summary.receiptCount += 1;
    summary.totalHal += r.totalHal;
    if (r.paymentMethod === "cash") summary.cashHal += r.totalHal;
    else if (r.paymentMethod === "card") summary.cardHal += r.totalHal;
    else summary.qrHal += r.totalHal;
  }
  return summary;
}

export type ClosedDay = { businessDate: string; cashHal: number; cardHal: number; qrHal: number };

/**
 * Jeden řádek „Tržby bistro“ za měsíc ve Financích (stejně jako ho Lucie
 * zapisovala ze Storyous): součet uzavřených dnů a rozpis podle platby.
 */
export function monthlyIncome(month: string, days: ClosedDay[]): { amountHal: number; note: string; entryDate: string } | null {
  const inMonth = days.filter((d) => d.businessDate.startsWith(`${month}-`)).sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  if (inMonth.length === 0) return null;
  const cash = inMonth.reduce((s, d) => s + d.cashHal, 0);
  const card = inMonth.reduce((s, d) => s + d.cardHal, 0);
  const qr = inMonth.reduce((s, d) => s + d.qrHal, 0);
  const last = inMonth[inMonth.length - 1].businessDate;
  const [y, m, d] = last.split("-").map(Number);
  return {
    amountHal: cash + card + qr,
    entryDate: last,
    note: `období 1.–${d}. ${m}. ${y} · hotově ${formatKc(cash)}, kartou ${formatKc(card)}, QR ${formatKc(qr)} · pokladna MojeBegina, ${inMonth.length} uzavřených dnů`,
  };
}
