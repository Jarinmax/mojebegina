export function formatKc(amount: number): string {
  return `${new Intl.NumberFormat("cs-CZ").format(amount)} Kč`;
}

export function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

// Přes UTC gettery ze stejného důvodu jako mock/customer.ts a
// lib/data/dashboard.ts — formátování nezávislé na časové zóně serverless
// funkce.
export function formatCzechDate(date: Date): string {
  return `${date.getUTCDate()}. ${date.getUTCMonth() + 1}. ${date.getUTCFullYear()}`;
}

// Security Phase 20 (Google Kalendář 1.0) — na rozdíl od formatCzechDate
// výše (datum beze změny přes UTC gettery, bezpečné jen pro hodnoty
// uložené na pevné 12:00 UTC) tahle funkce zobrazuje SKUTEČNÝ čas v
// Europe/Prague přes Intl.DateTimeFormat — potřeba pro termíny, které už
// mají reálnou hodinu/minutu (ne jen "nějaký den"), ne jen datum.
export function formatCzechDateTime(date: Date): string {
  const datePart = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart} ${timePart}`;
}
