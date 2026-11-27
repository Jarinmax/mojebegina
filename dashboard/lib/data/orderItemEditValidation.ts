/** Počet kusů z formuláře: celé číslo 0–999, jinak null. */
export function parseQuantity(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}
