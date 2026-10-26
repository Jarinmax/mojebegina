"use client";

// Rozpracovaná platba kartou (lib/eshop/pendingOrder.ts) v localStorage —
// stejný vzor jako useCart: useSyncExternalStore, změny z jiné záložky přes
// `storage` event, zablokované úložiště = jen v paměti.

import { useSyncExternalStore } from "react";
import { PENDING_ORDER_KEY, parsePendingOrder, serializePendingOrder, type PendingOrder } from "@/lib/eshop/pendingOrder";

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: PendingOrder | null = null;
let memoryRaw: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PENDING_ORDER_KEY);
  } catch {
    return memoryRaw;
  }
}

function read(): PendingOrder | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parsePendingOrder(raw, Date.now());
  }
  return cached;
}

function write(raw: string | null) {
  memoryRaw = raw;
  try {
    if (raw === null) window.localStorage.removeItem(PENDING_ORDER_KEY);
    else window.localStorage.setItem(PENDING_ORDER_KEY, raw);
  } catch {
    // zablokované úložiště — platí aspoň do obnovení stránky
  }
  listeners.forEach((listener) => listener());
}

/** Zapamatovat objednávku, jejíž platba se právě otevírá (před vyprázdněním košíku). */
export function rememberPendingOrder(orderId: string, orderNumber: number | null) {
  write(serializePendingOrder({ orderId, orderNumber, savedAt: Date.now() }));
}

/** Zapomenout — jen pokud jde o tutéž objednávku (jiná záložka mohla mezitím uložit novou). */
export function forgetPendingOrder(orderId: string) {
  if (parsePendingOrder(readRaw(), Date.now())?.orderId === orderId) write(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PENDING_ORDER_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePendingOrder(): PendingOrder | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
