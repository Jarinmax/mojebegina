// Hodnocení produktů — texty a formátování bez node:crypto (smí i do klientských komponent).

/** Věta podle zákona o ochraně spotřebitele: zda a jak recenze ověřujeme. */
export const REVIEW_VERIFICATION_NOTICE =
  "Hodnocení mohou psát jen zákazníci, kteří produkt zakoupili na begina.cz. Ověřujeme to podle čísla objednávky.";
export const VERIFIED_LABEL = "Ověřený nákup";
export const REVIEW_MAX_LENGTH = 1500;
export const REVIEW_NAME_MAX_LENGTH = 40;

export type ReviewSummary = { average: number; count: number };

/** Průměr na jedno desetinné místo; bez hodnocení null. */
export function summarize(ratings: readonly number[]): ReviewSummary | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return { average: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
}

/** „4,7“ */
export function formatAverage(average: number): string {
  return average.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** „1 hodnocení“, „3 hodnocení“ — slovo se v češtině nemění. */
export function countLabel(count: number): string {
  return `${count} hodnocení`;
}

