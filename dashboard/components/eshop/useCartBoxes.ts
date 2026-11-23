"use client";

// Výběr krabic v košíku (22. 11. 2026, Lucie) — sku balení 3 l, která se mají
// zabalit do kartonové krabice. Uloženo v localStorage vedle košíku; pokladna
// z něj spočítá počet krabic (boxOption.ts → boxesFromSelection).
import { useCallback, useSyncExternalStore } from "react";
import { parseBoxedSkus } from "@/lib/eshop/boxOption";

const STORAGE_KEY = "begina-eshop-boxes-v1";
const EMPTY: string[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: string[] = EMPTY;

function read(): string[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseBoxedSkus(raw);
  }
  return cached;
}

function write(skus: string[]) {
  const raw = JSON.stringify(skus);
  cachedRaw = raw;
  cached = skus;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // zůstane v paměti
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCartBoxes() {
  const boxed = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((sku: string, on: boolean) => {
    const current = read().filter((value) => value !== sku);
    write(on ? [...current, sku] : current);
  }, []);
  const clear = useCallback(() => write(EMPTY), []);
  return { boxed, toggle, clear };
}
