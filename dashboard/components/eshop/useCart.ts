"use client";

// E-shop 1.0 (náhled) — košík v localStorage, sdílený mezi všemi
// komponentami přes useSyncExternalStore (žádný provider). Samotná logika
// úprav košíku je čistá a testovaná v lib/eshop/cart.ts; tady je jen
// perzistence a notifikace. Změna v jiné záložce se propíše přes `storage`
// event.

import { useCallback, useSyncExternalStore } from "react";
import {
  addToCart,
  setLineQuantity,
  parseStoredCart,
  type CartLine,
} from "@/lib/eshop/cart";

// v2: řádky košíku jsou balení (sku), ne produkty (slug).
const STORAGE_KEY = "begina-eshop-cart-v2";
const EMPTY: CartLine[] = [];

const listeners = new Set<() => void>();
// Cache podle surového řetězce — getSnapshot musí pro nezměněná data
// vracet stejnou referenci, jinak useSyncExternalStore renderuje dokola.
let cachedRaw: string | null = null;
let cachedCart: CartLine[] = EMPTY;

function readCart(): CartLine[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Zablokované úložiště (privátní režim apod.) — košík žije jen v paměti.
    return cachedCart;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedCart = parseStoredCart(raw);
  }
  return cachedCart;
}

function writeCart(cart: CartLine[]) {
  const raw = JSON.stringify(cart);
  cachedRaw = raw;
  cachedCart = cart;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // viz readCart — zůstává aspoň v paměti do obnovení stránky
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot() {
  return EMPTY;
}

export function useCart() {
  const cart = useSyncExternalStore(subscribe, readCart, getServerSnapshot);

  const add = useCallback((sku: string, quantity = 1) => {
    writeCart(addToCart(readCart(), sku, quantity));
  }, []);
  const setQuantity = useCallback((sku: string, quantity: number) => {
    writeCart(setLineQuantity(readCart(), sku, quantity));
  }, []);
  const clear = useCallback(() => writeCart(EMPTY), []);

  return { cart, add, setQuantity, clear };
}

const noopSubscribe = () => () => {};

/** false při server renderu a hydrataci, true po ní — aby prázdný košík
 *  ze serveru neprobliknul jako "Košík je prázdný". */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
