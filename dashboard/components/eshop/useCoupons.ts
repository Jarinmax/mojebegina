"use client";

// Slevové kódy zákazníka: seznam kódů v localStorage (přežije přechod
// z košíku do pokladny i obnovení stránky) a jejich ověření na serveru
// (previewCouponsAction) při každé změně košíku, kódů nebo e-mailu.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { normalizeCouponCode, parseCouponCodes, MAX_COUPONS } from "@/lib/eshop/coupons";
import type { CartLine } from "@/lib/eshop/cart";
import { previewCouponsAction, type CouponPreview } from "@/app/eshop/kosik/couponActions";

const STORAGE_KEY = "begina-eshop-coupons-v1";
const EMPTY: string[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedCodes: string[] = EMPTY;

function readCodes(): string[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedCodes;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedCodes = parseCouponCodes(raw);
  }
  return cachedCodes;
}

function writeCodes(codes: string[]) {
  const raw = JSON.stringify(codes);
  cachedRaw = raw;
  cachedCodes = codes;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // zablokované úložiště — kódy žijí v paměti do obnovení stránky
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

/** Po odeslání objednávky se kódy zapomenou (příští nákup začíná bez nich). */
export function clearStoredCoupons() {
  writeCodes(EMPTY);
}

const NO_PREVIEW: CouponPreview = { applied: [], rejected: [], discountKc: 0, freeShipping: false, emailCheckPending: false };

export function useCoupons(cart: CartLine[], email?: string) {
  const codes = useSyncExternalStore(subscribe, readCodes, () => EMPTY);
  const [preview, setPreview] = useState<CouponPreview>(NO_PREVIEW);
  const [pending, setPending] = useState(false);
  // chyba právě zadaného kódu (ten se do seznamu neuloží)
  const [inputError, setInputError] = useState<string | null>(null);
  const cartKey = JSON.stringify(cart);

  useEffect(() => {
    let cancelled = false;
    if (codes.length === 0) {
      setPreview(NO_PREVIEW);
      return;
    }
    setPending(true);
    previewCouponsAction({ cart: cartKey, codes, email })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview({ ...NO_PREVIEW, rejected: codes.map((code) => ({ code, error: "Slevový kód se teď nepodařilo ověřit. Zkuste to prosím znovu." })) });
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cartKey, codes, email]);

  const apply = useCallback(
    async (raw: string): Promise<boolean> => {
      const code = normalizeCouponCode(raw);
      setInputError(null);
      if (!code) {
        setInputError("Zadejte slevový kód.");
        return false;
      }
      const current = readCodes();
      if (current.includes(code)) {
        setInputError(`Slevový kód „${code.toUpperCase()}“ už je uplatněný.`);
        return false;
      }
      if (current.length >= MAX_COUPONS) {
        setInputError(`Najednou lze uplatnit nejvýše ${MAX_COUPONS} slevových kódů.`);
        return false;
      }
      setPending(true);
      try {
        const next = [...current, code];
        const result = await previewCouponsAction({ cart: cartKey, codes: next, email });
        const failure = result.rejected.find((r) => r.code === code);
        if (failure) {
          setInputError(failure.error);
          return false;
        }
        writeCodes(next);
        setPreview(result);
        return true;
      } catch {
        setInputError("Slevový kód se teď nepodařilo ověřit. Zkuste to prosím znovu.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [cartKey, email]
  );

  const remove = useCallback((code: string) => {
    setInputError(null);
    writeCodes(readCodes().filter((c) => c !== code));
  }, []);

  return { codes, preview, pending, inputError, apply, remove };
}
