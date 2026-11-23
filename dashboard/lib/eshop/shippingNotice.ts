// 22. 11. 2026 (Lucie): pruh nad záhlavím e-shopu o odložené expedici
// (Jarin nemocný, sáčky 250 ml dorazí v úterý). Po datu `until` zmizí sám.
export type ShippingNotice = { text: string; until: string };

// 22. 11. 2026 14:47 (Lucie): pruh „odesíláme od středy 25. listopadu“ úplně odebrat.
export const SHIPPING_NOTICE: ShippingNotice | null = null;

/** Text pruhu, nebo null, když je po termínu (datum v Praze). */
export function activeShippingNotice(now: Date = new Date(), notice: ShippingNotice | null = SHIPPING_NOTICE): string | null {
  if (!notice) return null;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
  return today <= notice.until ? notice.text : null;
}
