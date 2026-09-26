// E-shop 1.0 (náhled) — čistá logika košíku, bez Reactu a bez localStorage,
// testovatelná stejně jako lib/data/*Validation.ts.
//
// Košík drží JEN slug a množství. Název a cena se vždy dohledávají
// v katalogu (lib/eshop/catalog.ts) — v prohlížeči kvůli zobrazení, na
// serveru znovu v priceCart(), takže úprava localStorage nemůže změnit cenu.

import { getProduct } from "./catalog";

export type CartLine = { slug: string; quantity: number };

export const MAX_QUANTITY_PER_LINE = 99;
export const MAX_CART_LINES = 50;

function clampQuantity(quantity: number): number {
  return Math.min(MAX_QUANTITY_PER_LINE, Math.max(0, Math.floor(quantity)));
}

export function addToCart(cart: CartLine[], slug: string, quantity = 1): CartLine[] {
  const existing = cart.find((line) => line.slug === slug);
  if (existing) {
    return setLineQuantity(cart, slug, existing.quantity + quantity);
  }
  if (cart.length >= MAX_CART_LINES) {
    return cart;
  }
  const clamped = clampQuantity(quantity);
  return clamped > 0 ? [...cart, { slug, quantity: clamped }] : cart;
}

/** Množství 0 (nebo méně) řádek odebere. */
export function setLineQuantity(cart: CartLine[], slug: string, quantity: number): CartLine[] {
  const clamped = clampQuantity(quantity);
  if (clamped === 0) {
    return cart.filter((line) => line.slug !== slug);
  }
  return cart.map((line) => (line.slug === slug ? { ...line, quantity: clamped } : line));
}

export function cartItemCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Obsah localStorage je nedůvěryhodný vstup (jiná verze appky, ruční
 * úprava) — zahodí vše, co není známý produkt s kladným celým množstvím,
 * a sloučí duplicitní řádky.
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
    const { slug, quantity } = entry as { slug?: unknown; quantity?: unknown };
    if (typeof slug !== "string" || !getProduct(slug)) {
      continue;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      continue;
    }
    cart = addToCart(cart, slug, quantity);
  }
  return cart;
}
