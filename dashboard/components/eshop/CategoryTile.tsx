import Link from "next/link";
import Image from "next/image";
import type { Category } from "@/lib/eshop/types";

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
  return (
    <Link
      href={`/eshop/kategorie/${category.slug}`}
      tabIndex={tabIndex}
      draggable={false}
      className="group block relative aspect-[5/8] overflow-hidden shadow-md shadow-neutral-400/50 bg-begina-primary-50"
    >
      {category.image && (
        <Image
          src={category.image}
          alt=""
          fill
          sizes={sizes}
          draggable={false}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
      {/* Překrývá název zapečený v obrázku (viz Category.image). */}
      <span className="absolute inset-x-0 top-[44%] h-[14%] bg-white/95 flex items-center justify-center text-center text-sm sm:text-base text-begina-primary-900 px-1">
        {category.name}
      </span>
    </Link>
  );
}
