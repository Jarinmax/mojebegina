"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import QuantityStepper from "./QuantityStepper";
import { useCart } from "./useCart";

type AddToCartButtonProps = {
  slug: string;
  name: string;
  /** Kompaktní varianta pro kartu v katalogu — bez výběru množství. */
  compact?: boolean;
};

export default function AddToCartButton({ slug, name, compact = false }: AddToCartButtonProps) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(slug, compact ? 1 : quantity);
    setAdded(true);
  }

  const button = (
    <button
      type="button"
      onClick={handleAdd}
      className="flex-1 flex items-center justify-center gap-1.5 bg-begina-primary-900 hover:bg-begina-primary-800 text-white text-sm font-medium rounded-lg px-4 h-9"
    >
      {added && compact ? <Check className="w-4 h-4" /> : null}
      {added && compact ? "V košíku" : "Do košíku"}
    </button>
  );

  if (compact) {
    return <div className="flex">{button}</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} label={`Množství – ${name}`} />
        {button}
      </div>
      {added && (
        <p className="mt-3 text-sm text-begina-primary-800 flex items-center gap-1.5" role="status">
          <Check className="w-4 h-4" />
          Přidáno do košíku.
          <Link href="/eshop/kosik" className="font-medium underline underline-offset-2">
            Zobrazit košík
          </Link>
        </p>
      )}
    </div>
  );
}
