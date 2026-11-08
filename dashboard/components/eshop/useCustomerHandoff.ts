"use client";

// Pas z MojeBegina (opakované objednávání karty) v tomto prohlížeči.
// Ukládá se jen podepsaný token; údaje karty si pokladna vždy načte
// znovu ze serveru (handoffPrefillAction), takže v prohlížeči nic
// neověřeného nezůstává a odebraný člen je hned bez přístupu.
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "begina-eshop-handoff-v1";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeHandoff(token: string | null) {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // úložiště nedostupné — předvyplnění se jen neuplatní
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

export function useCustomerHandoff(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Token z adresy „…/kosik#prevzit=…“ (a hned ho z adresy smaže). */
export function takeHandoffFromHash(): string | null {
  const match = /(?:^#|&)prevzit=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(window.location.hash);
  if (!match) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return match[1];
}
