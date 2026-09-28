import { ShoppingBag } from "lucide-react";
import { eshopLink, type EshopLink as EshopTarget } from "@/lib/eshopLink";

// Tlačítko do e-shopu (dnes jen v Řízení firmy). Cíl určuje výhradně
// lib/eshopLink.ts; externí adresa (begina.cz) se otevře v nové záložce,
// aby uživatel neopustil MojeBegina.
type Props = {
  label: string;
  target?: EshopTarget;
};

export default function EshopLink({ label, target = eshopLink }: Props) {
  return (
    <a
      href={target.href}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-begina-primary-900 px-4 py-3 text-sm font-medium text-white hover:bg-begina-primary-800 transition-colors"
      {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <ShoppingBag className="w-4 h-4" aria-hidden="true" />
      {label}
    </a>
  );
}
