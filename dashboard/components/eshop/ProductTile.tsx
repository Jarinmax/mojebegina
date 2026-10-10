import ShopLink from "./ShopLink";
import Image from "next/image";

// Dlaždice produktu v kolotoči (např. vybrané nápoje na stránce O vodě):
// stejný formát jako dlaždice kategorie, fotka a název pod ní. href = cesta
// e-shopu bez /eshop (ShopLink doplní základ podle domény).
export default function ProductTile({
  href,
  name,
  image,
  sizes,
}: {
  href: string;
  name: string;
  image: string | null;
  sizes: string;
}) {
  return (
    <ShopLink
      href={href}
      draggable={false}
      className="group flex flex-col aspect-[5/8] overflow-hidden shadow-md shadow-neutral-400/50 bg-white"
    >
      {/* Bez fotky zatím jen světlá plocha a název. */}
      <span className="relative flex-1 bg-begina-primary-50">
        {image && (
          <Image
            src={image}
            alt=""
            fill
            sizes={sizes}
            draggable={false}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </span>
      <span className="h-[18%] flex items-center justify-center text-center text-sm sm:text-base text-begina-primary-900 px-2">
        {name}
      </span>
    </ShopLink>
  );
}
