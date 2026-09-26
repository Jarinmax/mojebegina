import { Soup } from "lucide-react";

// Zástupný obrázek, dokud nemáme produktové fotky.
export default function ProductImage({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "w-16 h-16 rounded-lg", md: "aspect-[4/3] rounded-xl", lg: "aspect-square rounded-2xl" }[size];
  const icon = { sm: "w-7 h-7", md: "w-12 h-12", lg: "w-20 h-20" }[size];
  return (
    <div
      role="img"
      aria-label={name}
      className={`${box} shrink-0 bg-begina-primary-50 border border-neutral-200 flex items-center justify-center text-begina-primary-700`}
    >
      <Soup className={icon} strokeWidth={1.25} />
    </div>
  );
}
