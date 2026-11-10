import Image from "next/image";
import { Soup } from "lucide-react";
import { imageBackdrop } from "@/lib/eshop/productImages";

type ProductImageProps = {
  name: string;
  /** cesta v /public; null = zástupná ikonka, dokud nemáme fotku */
  src: string | null;
  size?: "sm" | "md" | "lg";
};

const BOX = { sm: "w-16 h-16 rounded-lg", md: "aspect-[4/3] rounded-xl", lg: "aspect-square rounded-2xl" };
const ICON = { sm: "w-7 h-7", md: "w-12 h-12", lg: "w-20 h-20" };
const SIZES = { sm: "64px", md: "(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw", lg: "(min-width: 768px) 480px, 100vw" };

export default function ProductImage({ name, src, size = "md" }: ProductImageProps) {
  if (src) {
    // fotka na bílém podkladu: celá (bez ořezu), okolí v barvě jejího okraje
    const backdrop = imageBackdrop(src);
    return (
      <div
        className={`${BOX[size]} relative shrink-0 overflow-hidden ${backdrop ? "" : "bg-neutral-800"}`}
        style={backdrop ? { backgroundColor: backdrop } : undefined}
      >
        <Image src={src} alt={name} fill sizes={SIZES[size]} className={backdrop ? "object-contain" : "object-cover"} />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={name}
      className={`${BOX[size]} shrink-0 bg-begina-primary-50 border border-neutral-200 flex items-center justify-center text-begina-primary-700`}
    >
      <Soup className={ICON[size]} strokeWidth={1.25} />
    </div>
  );
}
