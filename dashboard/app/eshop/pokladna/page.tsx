import type { Metadata } from "next";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = { title: "Objednávka" };

export default function CheckoutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <CheckoutForm />
    </div>
  );
}
