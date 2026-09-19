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
