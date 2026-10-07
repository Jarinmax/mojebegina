import type { Metadata } from "next";
import { isCardPaymentAvailable } from "@/lib/eshop/stripe/config";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = { title: "Objednávka" };
// Dostupnost platby kartou závisí na proměnných prostředí za běhu.
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <CheckoutForm cardPaymentAvailable={isCardPaymentAvailable()} />
    </div>
  );
}
