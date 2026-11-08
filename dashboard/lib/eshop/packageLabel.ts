// Označení balení (zadání Lucie a majitele, 8. 11. 2026): třílitrové
// balení je vždy „Begina 3 l“, ostatní jen skutečné množství s jednotkou —
// „500 ml“, „750 g“. Bez „Rodinná zásoba“, „bag-in-box“, „Begina box“ ani
// „Praktické balení“ (3 l se dodávají v sáčcích, krabici neslibujeme).
//
// TOTO je jediné místo, kde se označení balení určuje: katalog e-shopu
// (catalogDb.ts), košík, pokladna, název položky nové objednávky
// (productRules.lineName), MojeBegina, faktura i e-maily.
//
// Čisté funkce bez I/O. Používají se na štítky variant z katalogu (DB)
// i na názvy položek už uložených objednávek (order_items.name je snapshot
// z doby nákupu — v databázi se nepřepisuje, jen se tak zobrazuje).

/** Oddělovač produktu a balení v názvu položky: „Kulajda – 3 l“. */
export const PACKAGE_SEPARATOR = " – ";

// Množství na začátku štítku: „3 l Rodinná zásoba (bag-in-box)“ → 3 l,
// „750 g Praktické balení“ → 750 g. Jednotka se nemění (g zůstává g).
const LEADING_QUANTITY = /^\s*(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g)(?=$|[\s(),.;–—-])/i;

/** Třílitrové balení Begina. */
export const BEGINA_3L = "Begina 3 l";

/** Štítek balení → „Begina 3 l“ / množství s jednotkou; jiný štítek zůstane, jak je. */
export function simplePackageLabel(label: string): string {
  const match = LEADING_QUANTITY.exec(label);
  if (!match) return label.trim();
  const quantity = `${match[1].replace(".", ",")} ${match[2].toLowerCase()}`;
  return quantity === "3 l" ? BEGINA_3L : quantity;
}

/**
 * Název položky objednávky pro zobrazení: „Dýňová polévka — 3 l Rodinná
 * zásoba (bag-in-box)“ → „Dýňová polévka – Begina 3 l“. Názvy, kde za oddělovačem
 * není množství (ruční položky, B2B), zůstávají beze změny.
 */
export function displayItemName(name: string): string {
  const match = /^(.*\S)\s+[—–]\s+(.+)$/.exec(name);
  if (!match || !LEADING_QUANTITY.test(match[2])) return name;
  return `${match[1]}${PACKAGE_SEPARATOR}${simplePackageLabel(match[2])}`;
}
