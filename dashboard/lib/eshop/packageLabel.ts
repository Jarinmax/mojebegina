// Označení balení (zadání Lucie a majitele, 8. 11. 2026): třílitrové
// balení polévek a nápojů je „Begina 3 l“, ostatní jen skutečné množství
// s jednotkou — „500 ml“; bylinné sirupy od 9. 11. 2026 „3 l“ a „700 ml“. Bez „Rodinná zásoba“, „bag-in-box“, „Begina box“ ani
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

/**
 * Štítek balení → množství s jednotkou; jiný štítek zůstane, jak je.
 * Přesně „3 l“ zůstává „3 l“ (sirupy od 9. 11. 2026: „3 l“ a „700 ml“);
 * starší dlouhé štítky „3 l Rodinná zásoba…“ se dál zobrazují jako
 * „Begina 3 l“ (historické objednávky, polévky a nápoje mají „Begina 3 l“
 * přímo ve štítku).
 */
export function simplePackageLabel(label: string): string {
  if (/^\s*3\s*l\s*$/i.test(label)) return "3 l";
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
