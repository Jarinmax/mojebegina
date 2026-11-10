"use client";

import { useState } from "react";
import Image from "next/image";
import ProductImage from "./ProductImage";
import { imageBackdrop } from "@/lib/eshop/productImages";
import type { ProductPhoto } from "@/lib/eshop/types";

// Galerie na detailu produktu (od 10. 11. 2026): velká fotka a pod ní
// náhledy, kliknutím se přepne hlavní fotka. Jediná fotka = bez náhledů,
// stejně jako dřív.
export default function ProductGallery({ name, photos }: { name: string; photos: ProductPhoto[] }) {
  const [active, setActive] = useState(0);
  const current = photos[active] ?? photos[0] ?? null;
  return (
    <div>
      <ProductImage name={current?.alt ?? name} src={current?.url ?? null} size="lg" />
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
