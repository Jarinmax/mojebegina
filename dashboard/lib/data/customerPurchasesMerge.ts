// Nákupy zákazníka na kartě v Obchodu (18. 11. 2026) — čistá logika bez DB
// a bez sítě, ať jde otestovat.
//
// Zdroje: objednávky v MojeBegina (e-shop i ruční) a faktury v iDokladu podle
// IČO. Velká část odběratelů (Art-n-coffee, Kašpárek, Kandík…) má jen faktury
// vystavené ručně v iDokladu, objednávku v MojeBegina žádnou — proto karta
// dřív ukazovala 0 Kč. Jeden nákup se nesmí započítat dvakrát:
//   1. objednávka s fakturou (invoices.invoice_number) = ta faktura,
//   2. jinak se objednávka spáruje s fakturou se stejnou částkou (± 1 Kč,
//      iDoklad zaokrouhluje haléře) vystavenou nejvýš 3 dny od objednávky.
// Faktura bez objednávky je samostatný nákup.

export type PurchaseOrderInput = {
  id: string;
  orderNumber: string | null;
  invoiceNumber: string | null;
  orderedAt: Date;
  totalKc: number;
  /** zboží po slevě, bez dopravy */
  goodsKc: number;
  channel: string;
};

export type PurchaseInvoiceInput = {
  /** číslo faktury v iDokladu, např. 20260209 */
  number: string;
  issuedAt: Date;
  totalKc: number;
  goodsKc: number;
  paid: boolean;
};

export type CustomerPurchase = {
  key: string;
  date: Date;
  /** Objednávka z MojeBegina — id pro odkaz na detail; null u samotné faktury. */
  orderId: string | null;
  orderNumber: string | null;
  invoiceNumber: string | null;
  totalKc: number;
  goodsKc: number;
  source: "eshop" | "manual" | "invoice";
  paid: boolean;
};

export type CustomerPurchaseSummary = {
  purchases: CustomerPurchase[];
  count: number;
  totalKc: number;
  lastAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const MATCH_MAX_DAYS = 3;
export const MATCH_MAX_KC_DIFF = 1;

export function mergeCustomerPurchases(
  orders: PurchaseOrderInput[],
  invoices: PurchaseInvoiceInput[]
): CustomerPurchaseSummary {
  const remaining = new Map(invoices.map((inv) => [inv.number, inv]));
  const purchases: CustomerPurchase[] = [];
  const unmatchedOrders: PurchaseOrderInput[] = [];

  for (const order of orders) {
    const linked = order.invoiceNumber ? remaining.get(order.invoiceNumber) : undefined;
    if (linked) {
      remaining.delete(linked.number);
      purchases.push(fromOrder(order, linked));
    } else {
      unmatchedOrders.push(order);
    }
  }

  for (const order of unmatchedOrders) {
    let best: PurchaseInvoiceInput | null = null;
    let bestDays = Infinity;
    for (const inv of remaining.values()) {
      if (Math.abs(inv.totalKc - order.totalKc) > MATCH_MAX_KC_DIFF) continue;
      const days = Math.abs(inv.issuedAt.getTime() - order.orderedAt.getTime()) / DAY_MS;
      if (days <= MATCH_MAX_DAYS && days < bestDays) {
        best = inv;
        bestDays = days;
      }
    }
    if (best) remaining.delete(best.number);
    purchases.push(fromOrder(order, best));
  }

  for (const inv of remaining.values()) {
    purchases.push({
      key: `invoice:${inv.number}`,
      date: inv.issuedAt,
      orderId: null,
      orderNumber: null,
      invoiceNumber: inv.number,
      totalKc: inv.totalKc,
      goodsKc: inv.goodsKc,
      source: "invoice",
      paid: inv.paid,
    });
  }

  purchases.sort((a, b) => b.date.getTime() - a.date.getTime() || a.key.localeCompare(b.key));
  const totalKc = Math.round(purchases.reduce((sum, p) => sum + p.totalKc, 0) * 100) / 100;
  return {
    purchases,
    count: purchases.length,
    totalKc,
    lastAt: purchases.length > 0 ? purchases[0].date : null,
  };
}

function fromOrder(order: PurchaseOrderInput, invoice: PurchaseInvoiceInput | null | undefined): CustomerPurchase {
  return {
    key: `order:${order.id}`,
    date: order.orderedAt,
    orderId: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber: invoice?.number ?? order.invoiceNumber,
    totalKc: order.totalKc,
    goodsKc: order.goodsKc,
    source: order.channel === "eshop" ? "eshop" : "manual",
    paid: invoice ? invoice.paid : true,
  };
}

/** "18. 11. 2026" (formát z idokladPurchaseHistory) → půlnoc UTC toho dne. */
export function parseCzechDate(value: string): Date | null {
  const match = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(value.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

/** "Faktura č. 20260209" → "20260209". */
export function invoiceNumberFromLabel(label: string): string | null {
  const match = /(\d{5,})\s*$/.exec(label.trim());
  return match ? match[1] : null;
}

// --- Partnerský program na kartě zákazníka --------------------------------
// Pravidla jako měsíční vyhodnocení (lib/eshop/partnerMonthly.ts): jen
// uhrazené objednávky z e-shopu, hodnota zboží po slevě bez dopravy, měsíc
// podle data úhrady v Praze. Faktury mimo e-shop se nepočítají — zákazník,
// který přes e-shop neobjednává, na partnerskou slevu nárok nemá (o tom
// rozhoduje volající — tahle funkce už jen počítá úrovně).

export type PartnerEshopOrder = { paidAt: Date; goodsKc: number };

export type CustomerPartnerStatus =
  | { eligible: false }
  | {
      eligible: true;
      /** zboží z e-shopu uhrazené tento měsíc */
      thisMonthGoodsKc: number;
      /** úroveň, kterou má zákazník zatím na příští měsíc */
      nextMonthTierLabel: string;
      nextMonthPercent: number | null;
      /** další úroveň a kolik do ní chybí (null = nejvyšší úroveň) */
      nextTierLabel: string | null;
      remainingKc: number;
      /** sleva platná tento měsíc (podle minulého měsíce) */
      currentTierLabel: string;
      currentPercent: number | null;
    };

export type PartnerTierRule = { minAmount: number; discountLabel: string; discountPercent: number | null };

function pragueMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) - 1;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** „nad 5 000 do 8 000“ = 5 000,01 až 8 000 — stejné jako tierFor v partnerMonthly.ts. */
function tierIndex(goodsKc: number, sorted: PartnerTierRule[]): number {
  let index = 0;
  sorted.forEach((tier, i) => {
    if (goodsKc > tier.minAmount - 1) index = i;
  });
  return index;
}

export function customerPartnerStatus(
  eshopOrders: PartnerEshopOrder[],
  tiers: PartnerTierRule[],
  now: Date = new Date()
): CustomerPartnerStatus {
  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  const thisMonth = pragueMonthKey(now);
  const lastMonth = previousMonthKey(thisMonth);
  let thisMonthGoodsKc = 0;
  let lastMonthGoodsKc = 0;
  for (const order of eshopOrders) {
    const key = pragueMonthKey(order.paidAt);
    if (key === thisMonth) thisMonthGoodsKc += order.goodsKc;
    else if (key === lastMonth) lastMonthGoodsKc += order.goodsKc;
  }
  const nextIndex = tierIndex(thisMonthGoodsKc, sorted);
  const currentIndex = tierIndex(lastMonthGoodsKc, sorted);
  const nextTier = sorted[nextIndex + 1] ?? null;
  return {
    eligible: true,
    thisMonthGoodsKc,
    nextMonthTierLabel: sorted[nextIndex].discountLabel,
    nextMonthPercent: sorted[nextIndex].discountPercent,
    nextTierLabel: nextTier?.discountLabel ?? null,
    remainingKc: nextTier ? Math.max(0, Math.ceil(nextTier.minAmount - thisMonthGoodsKc)) : 0,
    currentTierLabel: sorted[currentIndex].discountLabel,
    currentPercent: sorted[currentIndex].discountPercent,
  };
}
