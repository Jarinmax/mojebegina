// Finance 1.0 — všechny částky se uvnitř počítají v CELÝCH HALÉŘÍCH
// (integer), nikdy v plovoucí čárce: 0,1 + 0,2 Kč musí dát přesně 0,30 Kč
// i po sečtení tisíců dokladů. iDoklad posílá desetinná čísla (decimal),
// převod na haléře se dělá jednou, při normalizaci.
//
// Bezpečný rozsah: Number.MAX_SAFE_INTEGER haléřů ≈ 90 bilionů Kč.

export type Halere = number;

export function toHalere(value: number | string | null | undefined): Halere {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(num)) {
    throw new Error(`Neplatná částka: ${String(value)}`);
  }
  // Math.round na absolutní hodnotě — symetrické zaokrouhlení, aby
  // −0,005 Kč a +0,005 Kč skončily se stejnou velikostí.
  const rounded = Math.round(Math.abs(num) * 100);
  return num < 0 ? -rounded : rounded;
}

export function sumHalere(values: Iterable<Halere>): Halere {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

export function halereToKc(value: Halere): number {
  return value / 100;
}

export function formatHalere(value: Halere): string {
  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(halereToKc(value));
  return `${formatted} Kč`;
}
