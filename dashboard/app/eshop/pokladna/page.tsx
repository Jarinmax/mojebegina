import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAgentRequest } from "@/lib/site/hosts";
import { isCardPaymentAvailable } from "@/lib/eshop/stripe/config";
import { shippingModeFromEnv } from "@/lib/eshop/shipping";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = { title: "Objednávka" };
// Dostupnost platby kartou a režim dopravy závisí na proměnných prostředí za běhu.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  // Pilotní doména asistenta: pokladna tam neexistuje (pojistka vedle proxy.ts).
  const h = await headers();
  if (isAgentRequest(h.get("host"), h.get("x-forwarded-host"))) notFound();
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <CheckoutForm cardPaymentAvailable={isCardPaymentAvailable()} shippingMode={shippingModeFromEnv()} />
    </div>
  );
}
