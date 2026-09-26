// E-shop 1.0 (náhled) — čistá logika košíku, bez Reactu a bez localStorage,
// testovatelná stejně jako lib/data/*Validation.ts.
//
// Košík drží JEN sku (konkrétní balení) a množství. Název a cena se vždy
// dohledávají v katalogu z DB (CatalogIndex) — v prohlížeči kvůli zobrazení,
// na serveru znovu v priceCart(), takže úprava localStorage nemůže změnit cenu.

import type { CatalogIndex } from "./catalogIndex";
import { lineName } from "./productRules";
import type { Product, Variant } from "./types";

export type CartLine = { sku: string; quantity: number };

export const MAX_QUANTITY_PER_LINE = 99;
export const MAX_CART_LINES = 50;

function clampQuantity(quantity: number): number {
  return Math.min(MAX_QUANTITY_PER_LINE, Math.max(0, Math.floor(quantity)));
}

export function addToCart(cart: CartLine[], sku: string, quantity = 1): CartLine[] {
  const existing = cart.find((line) => line.sku === sku);
  if (existing) {
    return setLineQuantity(cart, sku, existing.quantity + quantity);
  }
  if (cart.length >= MAX_CART_LINES) {
    return cart;
  }
  const clamped = clampQuantity(quantity);
  return clamped > 0 ? [...cart, { sku, quantity: clamped }] : cart;
}

/** Množství 0 (nebo méně) řádek odebere. */
export function setLineQuantity(cart: CartLine[], sku: string, quantity: number): CartLine[] {
  const clamped = clampQuantity(quantity);
  if (clamped === 0) {
    return cart.filter((line) => line.sku !== sku);
  }
  return cart.map((line) => (line.sku === sku ? { ...line, quantity: clamped } : line));
}

export function cartItemCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Obsah localStorage je nedůvěryhodný vstup (jiná verze appky, ruční
 * úprava) — zahodí vše, co nemá tvar {sku: text, quantity: kladné celé
 * číslo}, a sloučí duplicitní řádky. Balení, které v katalogu (už) není,
 * vyřadí až resolveCartLines / priceCart — parse katalog nezná.
 */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  let cart: CartLine[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { sku, quantity } = entry as { sku?: unknown; quantity?: unknown };
    if (typeof sku !== "string" || sku.length === 0 || sku.length > 100) {
      continue;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      continue;
    }
    cart = addToCart(cart, sku, quantity);
  }
  return cart;
}

export type ResolvedCartLine = CartLine & {
  product: Product;
  variant: Variant;
  name: string;
  lineTotalKc: number;
};

/** Dohledá balení v katalogu pro zobrazení v prohlížeči; neznámá balení
 *  vynechá. Závazná cena se počítá až na serveru (priceCart). */
export function resolveCartLines(cart: CartLine[], index: CatalogIndex): ResolvedCartLine[] {
  return cart.flatMap((line) => {
    const found = index.getVariant(line.sku);
    if (!found) {
      return [];
    }
    return [
      {
        ...line,
        ...found,
        name: lineName(found.product, found.variant),
        lineTotalKc: found.variant.priceKc * line.quantity,
      },
    ];
  });
}
