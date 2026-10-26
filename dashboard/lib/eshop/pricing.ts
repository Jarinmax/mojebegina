// E-shop 1.0 (náhled) — výpočet ceny objednávky. Jediné místo, kde
// vzniká cena: ceny balení z katalogu v DB (předaného jako CatalogIndex),
// cena dopravy ze shipping.ts (quoteShipping — paušál, nebo podle hmotnosti
// balení z katalogu). Klient posílá jen sku + množství + id způsobu doručení.
//
// Řádek má stejná pole jako CreateOrderValue.items v
// lib/data/orderValidation.ts (name/quantity/unitPriceKc/lineTotalKc),
// aby se z něj dal později přímo založit řádek v `orders`/`order_items`.

import type { CatalogIndex } from "./catalogIndex";
import { isOrderable, lineName } from "./productRules";
import { getShippingMethod, quoteShipping, type ShippingMethod, type ShippingMode } from "./shipping";
import { OPERATOR } from "./infoPages";
import { MAX_CART_LINES, MAX_QUANTITY_PER_LINE } from "./cart";

export type PricedLine = {
  sku: string;
  name: string;
  quantity: number;
  unitPriceKc: number;
  lineTotalKc: number;
};

export type PricedCart = {
  lines: PricedLine[];
  shipping: ShippingMethod;
  subtotalKc: number;
  shippingKc: number;
  totalKc: number;
  /** Hmotnost košíku v gramech (jen doprava podle hmotnosti), jinak null. */
  weightGrams: number | null;
  /** Košík obsahuje alkohol — pokladna musí vyžadovat potvrzení 18+. */
  containsAgeRestricted: boolean;
};

export type CartInputLine = { sku: string; quantity: number };

export function priceCart(
  input: CartInputLine[],
  shippingMethodId: string,
  index: CatalogIndex,
  options: { shippingMode?: ShippingMode } = {}
): { ok: true; value: PricedCart } | { ok: false; error: string } {
  const shippingMode = options.shippingMode ?? "flat";
  if (input.length === 0) {
    return { ok: false, error: "Košík je prázdný." };
  }
  if (input.length > MAX_CART_LINES) {
    return { ok: false, error: `Košík může mít nejvýše ${MAX_CART_LINES} položek.` };
  }

  const shipping = getShippingMethod(shippingMethodId, shippingMode);
  if (!shipping) {
    return { ok: false, error: "Vyberte způsob doručení." };
  }

  const seen = new Set<string>();
  const lines: PricedLine[] = [];
  const weights: (number | null)[] = [];
  let containsAgeRestricted = false;
  for (const item of input) {
    const found = index.getVariant(item.sku);
    if (!found) {
      return { ok: false, error: "Košík obsahuje produkt, který už nenabízíme. Obnovte prosím košík." };
    }
    const { product, variant } = found;
    const name = lineName(product, variant);
    // Neověřené alergeny (null) — jediné místo, které platí pro košík,
    // pokladnu i náhradní objednávku; obejít to nejde ani podvrženým košíkem.
    if (!isOrderable(product)) {
      return {
        ok: false,
        error: `Produkt "${product.name}" zatím nelze objednat — ověřujeme u něj alergeny. Odeberte ho prosím z košíku.`,
      };
    }
    if (seen.has(variant.sku)) {
      return { ok: false, error: "Košík obsahuje duplicitní položku. Obnovte prosím košík." };
    }
    seen.add(variant.sku);
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_QUANTITY_PER_LINE
    ) {
      return {
        ok: false,
        error: `Množství u položky "${name}" musí být 1 až ${MAX_QUANTITY_PER_LINE}.`,
      };
    }
    containsAgeRestricted ||= product.isAgeRestricted;
    weights.push(variant.weightGrams);
    lines.push({
      sku: variant.sku,
      name,
      quantity: item.quantity,
      unitPriceKc: variant.priceKc,
      lineTotalKc: variant.priceKc * item.quantity,
    });
  }

  // Nad 150 kg nebo bez známé hmotnosti chlazenou přepravu nejde objednat
  // automaticky — server ji odmítne, i kdyby ji formulář (podvržený) poslal.
  const quote = quoteShipping(
    shipping,
    lines.map((line, i) => ({ sku: line.sku, name: line.name, quantity: line.quantity, weightGrams: weights[i] })),
    shippingMode,
    OPERATOR
  );
  if (!quote.available) {
    return { ok: false, error: quote.message };
  }

  const subtotalKc = lines.reduce((sum, line) => sum + line.lineTotalKc, 0);
  return {
    ok: true,
    value: {
      lines,
      shipping,
      subtotalKc,
      shippingKc: quote.priceKc,
      totalKc: subtotalKc + quote.priceKc,
      weightGrams: quote.weightGrams,
      containsAgeRestricted,
    },
  };
}
