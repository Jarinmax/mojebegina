// Historie nákupů u kontaktů v CRM (zadání Lucie 18. 11. 2026): obchodník má
// před hovorem vidět, co bývalý zákazník opravdu kupoval — podle vydaných
// faktur v iDokladu. Čisté funkce: seskupení faktur podle odběratele a
// spárování s kontakty (e-mail, jinak přesně stejné jméno). Testy:
// lib/data/__tests__/purchaseHistory.test.ts.

export type HistoryInvoice = {
  number: string;
  day: string | null;
  totalKc: number | null;
  email: string | null;
  name: string | null;
  ico: string | null;
  items: { name: string; quantity: number }[];
};

export type PurchasedItem = { name: string; quantity: number; lastDay: string | null };

export type PurchaseHistory = {
  matchedBy: "email" | "name";
  invoices: number;
  totalKc: number;
  firstDay: string | null;
  lastDay: string | null;
  items: PurchasedItem[];
};

export type HistoryLead = { id: string; name: string | null; email: string | null };

/** Jméno / název pro porovnání: bez diakritiky, velikosti písmen, titulů a oddělovačů. */
export function personKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(mgr|ing|bc|mudr|judr|phdr|rndr|paeddr|mvdr|doc|prof|ph ?d|csc|mba|dis)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Klíč jména nezávislý na pořadí (Jana Nováková = Nováková Jana); jedno slovo je málo. */
export function nameMatchKey(raw: string | null | undefined): string | null {
  const words = personKey(raw).split(" ").filter(Boolean);
  return words.length >= 2 ? [...words].sort().join(" ") : null;
}

export function emailKey(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

/** Řádky faktury, které nejsou zboží (doprava, sleva, obal, zaokrouhlení…). */
export function isGoodsLine(name: string): boolean {
  return !/^(sleva|doprava|dopravn|chlazen[aá] p[rř]eprava|p[rř]eprava|po[sš]tovn|bal[ií]k|z[aá]silkovna|krabice|obal|zaokrouhlen|z[aá]loha|dob[ií]rk|osobn[ií] odb[eě]r)/i.test(name.trim());
}

/** Název výrobku pro sčítání: „Lipový sirup – 3 l“ a „Lipový sirup 3 l“ je totéž. */
export function itemKey(name: string): string {
  return personKey(name.replace(/[–—-]/g, " "));
}

function addInvoice(history: PurchaseHistory, invoice: HistoryInvoice, byItem: Map<string, PurchasedItem>): void {
  history.invoices += 1;
  history.totalKc += invoice.totalKc ?? 0;
  if (invoice.day) {
    if (!history.firstDay || invoice.day < history.firstDay) history.firstDay = invoice.day;
    if (!history.lastDay || invoice.day > history.lastDay) history.lastDay = invoice.day;
  }
  for (const item of invoice.items) {
    const name = item.name.replace(/\s+/g, " ").trim();
    if (!name || !isGoodsLine(name) || !(item.quantity > 0)) continue;
    const key = itemKey(name);
    const existing = byItem.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      if (invoice.day && (!existing.lastDay || invoice.day > existing.lastDay)) {
        existing.lastDay = invoice.day;
        existing.name = name; // novější pojmenování výrobku
      }
    } else {
      byItem.set(key, { name, quantity: item.quantity, lastDay: invoice.day });
    }
  }
}

/**
 * Historie nákupů pro každý kontakt. Shoda e-mailu má přednost; podle jména se
 * páruje jen tehdy, když je jméno mezi KONTAKTY jedinečné (dva lidé stejného
 * jména = nic, aby se historie nepřipsala cizímu člověku) a kontakt nemá
 * shodu e-mailem. Stornované a nulové doklady se počítají tak, jak v iDokladu jsou.
 */
export function matchPurchaseHistory(leads: readonly HistoryLead[], invoices: readonly HistoryInvoice[]): Map<string, PurchaseHistory> {
  const byEmail = new Map<string, HistoryInvoice[]>();
  const byName = new Map<string, HistoryInvoice[]>();
  for (const invoice of invoices) {
    const email = emailKey(invoice.email);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), invoice]);
    const name = nameMatchKey(invoice.name);
    if (name) byName.set(name, [...(byName.get(name) ?? []), invoice]);
  }
  const nameCount = new Map<string, number>();
  for (const lead of leads) {
    const key = nameMatchKey(lead.name);
    if (key) nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }

  const result = new Map<string, PurchaseHistory>();
  for (const lead of leads) {
    const email = emailKey(lead.email);
    const name = nameMatchKey(lead.name);
    const emailHits = email ? (byEmail.get(email) ?? []) : [];
    const nameHits = name && nameCount.get(name) === 1 ? (byName.get(name) ?? []) : [];
    const matchedBy = emailHits.length > 0 ? "email" : nameHits.length > 0 ? "name" : null;
    if (!matchedBy) continue;
    // e-mailová shoda + faktury téhož jména (starší faktury často e-mail nemají); každá faktura jednou
    const seen = new Set<string>();
    const mine = [...emailHits, ...nameHits].filter((i) => (seen.has(i.number) ? false : (seen.add(i.number), true)));
    const history: PurchaseHistory = { matchedBy, invoices: 0, totalKc: 0, firstDay: null, lastDay: null, items: [] };
    const byItem = new Map<string, PurchasedItem>();
    for (const invoice of mine) addInvoice(history, invoice, byItem);
    history.totalKc = Math.round(history.totalKc * 100) / 100;
    history.items = [...byItem.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "cs"));
    result.set(lead.id, history);
  }
  return result;
}
