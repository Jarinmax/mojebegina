import type { Metadata } from "next";
import CartView from "@/components/eshop/CartView";

export const metadata: Metadata = { title: "Košík" };

export default function CartPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Košík</h1>
      <CartView />
    </div>
  );
}
