import ShopLink from "./ShopLink";
import Image from "next/image";
import type { Category } from "@/lib/eshop/types";
import { HOME_CATEGORIES } from "@/lib/eshop/homeNav";

// Dlaždice kategorie (úvod e-shopu, kolotoč pod stránkami).
export default function CategoryTile({
  category,
  sizes,
  tabIndex,
}: {
  category: Pick<Category, "slug" | "name" | "image">;
  sizes: string;
  tabIndex?: number;
}) {
  const icon = category.image ? null : HOME_CATEGORIES.find((c) => c.slug === category.slug)?.icon ?? null;
  return (
    <ShopLink
      href={`/kategorie/${category.slug}`}
      tabIndex={tabIndex}
      draggable={false}
      className="group block relative aspect-[5/8] overflow-hidden shadow-md shadow-neutral-400/50 bg-begina-primary-50"
    >
      {category.image ? (
        <Image
          src={category.image}
          alt=""
          fill
          sizes={sizes}
          draggable={false}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        // kategorie zatím bez fotky (Zmrzliny): ikona z pruhu na úvodu nad názvem
        icon && (
          <span className="absolute inset-x-[12%] top-[10%] h-[30%]">
            <Image src={icon} alt="" fill sizes="160px" draggable={false} className="object-contain transition-transform duration-300 group-hover:scale-105" />
          </span>
        )
      )}
      {/* Překrývá název zapečený v obrázku (viz Category.image). */}
      <span className="absolute inset-x-0 top-[44%] h-[14%] bg-white/95 flex items-center justify-center text-center text-sm sm:text-base text-begina-primary-900 px-1">
        {category.name}
      </span>
    </ShopLink>
  );
}
