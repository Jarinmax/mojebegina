// E-shop 1.0 (náhled) — výpočet ceny objednávky. Jediné místo, kde
// vzniká cena: ceny produktů z katalogu, cena dopravy ze shipping.ts.
// Klient posílá jen slug + množství + id způsobu doručení.
//
// Výstup má stejný tvar jako CreateOrderValue.items v
// lib/data/orderValidation.ts (name/quantity/unitPriceKc/lineTotalKc),
// aby se z něj dal později přímo založit řádek v `orders`/`order_items`.

import { getProduct } from "./catalog";
import { getShippingMethod, type ShippingMethod } from "./shipping";
import { MAX_CART_LINES, MAX_QUANTITY_PER_LINE } from "./cart";

export type PricedLine = {
  slug: string;
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
};

export type CartInputLine = { slug: string; quantity: number };

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
  for (const item of input) {
    const product = getProduct(item.slug);
    if (!product) {
      return { ok: false, error: "Košík obsahuje produkt, který už nenabízíme. Obnovte prosím košík." };
    }
    if (seen.has(product.slug)) {
      return { ok: false, error: "Košík obsahuje duplicitní položku. Obnovte prosím košík." };
    }
    seen.add(product.slug);
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_QUANTITY_PER_LINE
    ) {
      return {
        ok: false,
        error: `Množství u položky "${product.name}" musí být 1 až ${MAX_QUANTITY_PER_LINE}.`,
      };
    }
    lines.push({
      slug: product.slug,
      name: product.name,
      quantity: item.quantity,
      unitPriceKc: product.priceKc,
      lineTotalKc: product.priceKc * item.quantity,
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
    },
  };
}
