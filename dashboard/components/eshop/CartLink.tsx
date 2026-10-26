"use client";

import ShopLink from "./ShopLink";
import { ShoppingBag } from "lucide-react";
import { cartItemCount, resolveCartLines } from "@/lib/eshop/cart";
import { useCatalog } from "./CatalogProvider";
import { useCart } from "./useCart";

export default function CartLink() {
  const { cart } = useCart();
  const catalog = useCatalog();
  const count = cartItemCount(resolveCartLines(cart, catalog));

  return (
    <ShopLink
      href="/kosik"
      aria-label={count > 0 ? `Košík, ${count} ks` : "Košík"}
      className="flex items-center gap-1.5 text-sm font-medium text-begina-primary-900"
    >
      <span className="relative">
        <ShoppingBag className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-begina-accent-700 text-white text-[10px] font-medium flex items-center justify-center">
            {count}
          </span>
        )}
      </span>
      <span className="hidden sm:inline ml-1">Košík</span>
    </ShopLink>
  );
}
