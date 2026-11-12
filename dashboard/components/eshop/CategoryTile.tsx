import ShopLink from "./ShopLink";
import Image from "next/image";
import { imageBackdrop } from "@/lib/eshop/productImages";
import type { Category } from "@/lib/eshop/types";
import { HOME_CATEGORIES } from "@/lib/eshop/homeNav";

// Karta kategorie v posuvném přehledu (O nás, O vodě, O balení, Doprava…).
// Od 10. 11. 2026: fotografie souvisle nahoře, název pod ní na bílém
// podkladu; celá karta je jeden odkaz do kategorie.
//
// Současné fotografie kategorií mají název i bílý pruh přímo zapečené
// v obrázku (řádky 222–283 z 494 px). Než dorazí nové fotografie bez textu,
// ukazuje karta jen spodní část fotky pod pruhem (poměr 3 : 2, zarovnání
// dolů) — pruh ani zdvojený světlý název tak nejsou vidět. Fotky na bílém
// podkladu (polévky, lib/eshop/productImages.ts) se ukazují celé.
export default function CategoryTile({
  category,
  sizes,
  tabIndex,
}: {
  category: Pick<Category, "slug" | "name" | "image">;
  sizes: string;
  tabIndex?: number;
}) {
  // Od 11. 11. 2026 má přednost nová ikona kategorie (stejná jako na úvodu);
  // staré tmavé fotky kategorií se ukážou jen tam, kde ikona chybí.
  const icon = HOME_CATEGORIES.find((c) => c.slug === category.slug)?.icon ?? null;
  const photo = icon ? null : category.image;
  const backdrop = icon ? "#FAF6EF" : imageBackdrop(photo);
  return (
    <ShopLink
      href={`/kategorie/${category.slug}`}
      tabIndex={tabIndex}
      draggable={false}
      className="group flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-md shadow-neutral-400/40 ring-1 ring-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-begina-primary-900"
    >
      <span
        className={`relative block aspect-[3/2] overflow-hidden ${backdrop ? "" : "bg-begina-primary-50"}`}
        style={backdrop ? { backgroundColor: backdrop } : undefined}
      >
        {photo ? (
          <Image
            src={photo}
            alt={category.name}
            fill
            sizes={sizes}
            draggable={false}
            className={`${backdrop ? "object-contain" : "object-cover object-bottom"} transition-transform duration-300 group-hover:scale-105`}
          />
        ) : (
          // ikona kategorie z pruhu na úvodu
          icon && (
            <span className="absolute inset-[10%]">
              <Image src={icon} alt="" fill sizes="200px" draggable={false} className="object-contain transition-transform duration-300 group-hover:scale-105" />
            </span>
          )
        )}
      </span>
      <span className="flex flex-1 items-center justify-center px-3 py-3 text-center text-base font-medium leading-snug text-begina-primary-900 group-hover:underline underline-offset-4">
        {category.name}
      </span>
    </ShopLink>
  );
}
