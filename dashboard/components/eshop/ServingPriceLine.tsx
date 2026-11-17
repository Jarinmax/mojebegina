"use client";

// Cena za porci pod cenou produktu (17. 11. 2026, Lucie): u produktu s více
// baleními ukazuje řádek jen to balení, které má zákazník právě zvolené
// v AddToCartButton (událost VARIANT_EVENT). Výchozí je první balení –
// stejně jako výchozí volba v AddToCartButton.
import { useEffect, useState } from "react";

export const VARIANT_EVENT = "begina:variant";

export type ServingPriceRow = { sku: string; label: string | null; text: string };

export default function ServingPriceLine({ rows, defaultSku }: { rows: ServingPriceRow[]; defaultSku: string }) {
  const [sku, setSku] = useState(defaultSku);
  useEffect(() => {
    const onVariant = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (typeof next === "string") setSku(next);
    };
    window.addEventListener(VARIANT_EVENT, onVariant);
    return () => window.removeEventListener(VARIANT_EVENT, onVariant);
  }, []);
  const row = rows.find((item) => item.sku === sku);
  if (!row) return null;
  return (
    <p className="pl-6 tabular-nums" aria-live="polite">
      {row.label ? <span className="text-neutral-500">{row.label}: </span> : null}
      {row.text}
    </p>
  );
}
