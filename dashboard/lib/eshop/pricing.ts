// E-shop 1.0 (náhled) — výpočet ceny objednávky. Jediné místo, kde
// vzniká cena: ceny balení z katalogu, cena dopravy ze shipping.ts.
// Klient posílá jen sku + množství + id způsobu doručení.
//
// Řádek má stejná pole jako CreateOrderValue.items v
// lib/data/orderValidation.ts (name/quantity/unitPriceKc/lineTotalKc),
// aby se z něj dal později přímo založit řádek v `orders`/`order_items`.

import { getVariant, isAgeRestricted, lineName } from "./catalog";
import { getShippingMethod, type ShippingMethod } from "./shipping";
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
  /** Košík obsahuje alkohol — pokladna musí vyžadovat potvrzení 18+. */
  containsAgeRestricted: boolean;
};

export type CartInputLine = { sku: string; quantity: number };

export function priceCart(
  input: CartInputLine[],
  shippingMethodId: string
): { ok: true; value: PricedCart } | { ok: false; error: string } {
  if (input.length === 0) {
    return { ok: false, error: "Košík je prázdný." };
  }
  if (input.length > MAX_CART_LINES) {
    return { ok: false, error: `Košík může mít nejvýše ${MAX_CART_LINES} položek.` };
  }

  const shipping = getShippingMethod(shippingMethodId);
  if (!shipping) {
    return { ok: false, error: "Vyberte způsob doručení." };
  }

  const seen = new Set<string>();
  const lines: PricedLine[] = [];
  let containsAgeRestricted = false;
  for (const item of input) {
    const found = getVariant(item.sku);
    if (!found) {
      return { ok: false, error: "Košík obsahuje produkt, který už nenabízíme. Obnovte prosím košík." };
    }
    const { product, variant } = found;
    const name = lineName(product, variant);
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
    containsAgeRestricted ||= isAgeRestricted(product);
    lines.push({
      sku: variant.sku,
      name,
      quantity: item.quantity,
      unitPriceKc: variant.priceKc,
      lineTotalKc: variant.priceKc * item.quantity,
    });
  }

  const subtotalKc = lines.reduce((sum, line) => sum + line.lineTotalKc, 0);
  return {
    ok: true,
    value: {
      lines,
      shipping,
      subtotalKc,
      shippingKc: shipping.priceKc,
      totalKc: subtotalKc + shipping.priceKc,
      containsAgeRestricted,
    },
  };
}
