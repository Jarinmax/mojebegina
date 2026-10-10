// Přepínače přechodu na begina.cz — VÝCHOZÍ STAV = VYPNUTO.
//
// ESHOP_CANONICAL_ORIGIN=https://begina.cz
//   Zapnout AŽ PO přepnutí DNS (begina.cz už míří na tuto aplikaci). Potom:
//   moje.begina.cz/eshop/… → 301 na begina.cz/…, odkazy v e-mailech a návrat
//   ze Stripe vedou na begina.cz. Jiná hodnota než přesně https://begina.cz
//   se ignoruje (žádné přesměrování na cizí doménu ani při překlepu).
//   Při návratu na WordPress vypnout DŘÍV, než se vrátí DNS.
//
// ESHOP_INDEXING=on
//   Vyhledávače smí indexovat begina.cz (robots.txt, meta robots,
//   X-Robots-Tag). Bez něj je všude noindex. moje.begina.cz se neindexuje
//   nikdy.
//
// Na Preview (VERCEL_ENV=preview) se oba přepínače ignorují — Preview nesmí
// posílat zákazníky na produkční doménu ani se nechat indexovat.
import { PUBLIC_ORIGIN } from "./hosts";

type Env = Record<string, string | undefined>;

export function canonicalRedirectEnabled(env: Env = process.env): boolean {
  return env.VERCEL_ENV !== "preview" && env.ESHOP_CANONICAL_ORIGIN?.trim() === PUBLIC_ORIGIN;
}

export function indexingEnabled(env: Env = process.env): boolean {
  return env.VERCEL_ENV !== "preview" && env.ESHOP_INDEXING === "on";
}
