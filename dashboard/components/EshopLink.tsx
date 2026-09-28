import { ShoppingBag } from "lucide-react";
import { eshopLink, type EshopLink as EshopTarget } from "@/lib/eshopLink";

// Tlačítko do e-shopu. Cíl určuje výhradně lib/eshopLink.ts; externí adresa
// (begina.cz) se otevře v nové záložce, aby uživatel neopustil MojeBegina.
//   header — kompaktní tlačítko do horní lišty
//   card   — výrazné tlačítko na celou šířku (Řízení firmy, zákaznická karta)
type Props = {
  label: string;
  variant: "header" | "card";
  target?: EshopTarget;
};

const CLASSES = {
  header:
    "inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-begina-primary-900 px-2.5 py-1 text-xs font-medium text-begina-primary-900 hover:bg-begina-primary-900 hover:text-white transition-colors",
  card: "flex w-full items-center justify-center gap-2 rounded-xl bg-begina-primary-900 px-4 py-3 text-sm font-medium text-white hover:bg-begina-primary-800 transition-colors",
};

export default function EshopLink({ label, variant, target = eshopLink }: Props) {
  return (
    <a
      href={target.href}
      className={CLASSES[variant]}
      {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <ShoppingBag className={variant === "header" ? "w-3.5 h-3.5" : "w-4 h-4"} aria-hidden="true" />
      {label}
    </a>
  );
}
