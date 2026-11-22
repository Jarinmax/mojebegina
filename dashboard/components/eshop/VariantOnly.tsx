"use client";

// Zobrazí obsah jen při zvoleném balení z daného seznamu (událost VARIANT_EVENT
// z AddToCartButton). 22. 11. 2026: nabídka „První begina + 4 vzorky zdarma“
// se u sirupů ukazuje jen při volbě třílitrového balení, ne u 650 ml.
import { useEffect, useState, type ReactNode } from "react";
import { VARIANT_EVENT } from "./ServingPriceLine";

export default function VariantOnly({ skus, defaultSku, children }: { skus: string[]; defaultSku: string; children: ReactNode }) {
  const [sku, setSku] = useState(defaultSku);
  useEffect(() => {
    const onVariant = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (typeof next === "string") setSku(next);
    };
    window.addEventListener(VARIANT_EVENT, onVariant);
    return () => window.removeEventListener(VARIANT_EVENT, onVariant);
  }, []);
  return skus.includes(sku) ? <>{children}</> : null;
}
