"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";
import ProductImage from "./ProductImage";
import { imageBackdrop } from "@/lib/eshop/productImages";
import type { ProductPhoto } from "@/lib/eshop/types";

// Galerie na detailu produktu (od 10. 11. 2026): velká fotka a pod ní
// náhledy, kliknutím se přepne hlavní fotka. Jediná fotka = bez náhledů,
// stejně jako dřív.
// note: drobný popisek pod hlavní fotkou (např. „Návrh servírování“ u polévek –
// ozdoba na fotce není součástí balení).
// Kliknutím na velkou fotku se otevře přes celou obrazovku (Lucie 18. 11. 2026),
// zavře se křížkem, kliknutím kamkoli nebo klávesou Esc.
export default function ProductGallery({ name, photos, note }: { name: string; photos: ProductPhoto[]; note?: string }) {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const current = photos[active] ?? photos[0] ?? null;
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [zoomed]);
  return (
    <div>
      {current?.url ? (
        <button type="button" onClick={() => setZoomed(true)} aria-label="Zvětšit fotografii" className="block w-full cursor-zoom-in">
          <ProductImage name={current.alt ?? name} src={current.url} size="lg" />
        </button>
      ) : (
        <ProductImage name={name} src={null} size="lg" />
      )}
      {zoomed && current?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.alt ?? name}
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-8 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- plná velikost bez ořezu */}
          <img src={current.url} alt={current.alt ?? name} className="max-h-full max-w-full object-contain rounded-lg" />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Zavřít"
            className="absolute top-3 right-3 rounded-full bg-white/90 p-2 text-neutral-900 hover:bg-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
      {note && <p className="mt-1.5 text-xs text-neutral-500">{note}</p>}
      {photos.length > 1 && (
        <ul className="mt-3 flex gap-3" aria-label="Fotografie produktu">
          {photos.map((photo, index) => {
            const backdrop = imageBackdrop(photo.url);
            return (
              <li key={photo.url}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Fotografie ${index + 1} z ${photos.length}${photo.alt ? `: ${photo.alt}` : ""}`}
                  aria-current={index === active ? "true" : undefined}
                  className={`relative block w-20 h-20 sm:w-24 sm:h-24 overflow-hidden rounded-lg ring-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-begina-primary-900 ${
                    index === active ? "ring-2 ring-begina-primary-900" : "ring-1 ring-neutral-200 hover:ring-neutral-400"
                  } ${backdrop ? "" : "bg-neutral-800"}`}
                  style={backdrop ? { backgroundColor: backdrop } : undefined}
                >
                  <Image src={photo.url} alt="" fill sizes="96px" className={backdrop ? "object-contain" : "object-cover"} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
