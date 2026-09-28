"use server";

// „Zaplatit znovu“ — nová (nebo ještě otevřená) platební stránka Stripe pro
// nezaplacenou e-shopovou objednávku. Podmínky hlídá startCardPayment.
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { parseOrderToken } from "@/lib/eshop/orderWrite";
import { stripeConfig } from "@/lib/eshop/stripe/config";
import { getStripe } from "@/lib/eshop/stripe/client";
import { startCardPayment } from "@/lib/eshop/stripe/payment";

export type PayAgainState = { error: string } | { redirectTo: string } | null;

export async function payAgainAction(_prev: PayAgainState, formData: FormData): Promise<PayAgainState> {
  const orderId = parseOrderToken(String(formData.get("orderId") ?? ""));
  const config = stripeConfig();
  if (!orderId || !config) {
    return { error: "Platba kartou teď není dostupná." };
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  try {
    const result = await startCardPayment(db, getStripe(config).checkout.sessions, orderId, `${proto}://${host}`);
    return result.ok ? { redirectTo: result.url } : { error: result.error };
  } catch (error) {
    console.error("E-shop: nová platba selhala", orderId, error);
    return { error: "Platební bránu se nepodařilo otevřít. Zkuste to prosím za chvíli." };
  }
}
