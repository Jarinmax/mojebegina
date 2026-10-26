"use client";

// Zobrazení produktu pro Meta (ViewContent) — bez účinku, dokud není pixel
// zapnutý a zákazník nesouhlasil s reklamními cookies (lib/eshop/metaPixel.ts).
import { useEffect } from "react";
import { trackMeta } from "@/lib/eshop/metaPixel";

export default function MetaViewContent({ sku, name, priceKc }: { sku: string; name: string; priceKc: number }) {
  useEffect(() => {
    trackMeta("ViewContent", { content_type: "product", content_ids: [sku], content_name: name, value: priceKc });
  }, [sku, name, priceKc]);
  return null;
}
