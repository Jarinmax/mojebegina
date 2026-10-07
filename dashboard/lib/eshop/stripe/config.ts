// ESHOP 1.0 — Stripe (platba kartou). Kdy je platba kartou dostupná:
//   - jen když pokladna vůbec ukládá objednávky (isOrderWriteEnabled),
//   - STRIPE_SECRET_KEY i STRIPE_WEBHOOK_SECRET jsou nastavené,
//   - mimo Vercel Production VÝHRADNĚ testovací klíč (sk_test_/rk_test_) —
//     ostrý klíč omylem vložený do Preview se nepoužije,
//   - ve Vercel Production navíc výslovně ESHOP_STRIPE_LIVE=on (den přepnutí
//     z WooCommerce) a VÝHRADNĚ ostrý klíč (sk_live_/rk_live_). Bez toho
//     Production kartou platit nenabízí.
import { isOrderWriteEnabled } from "../orderWrite";

type Env = Record<string, string | undefined>;

export type StripeConfig = { secretKey: string; webhookSecret: string; testMode: boolean };

export function stripeConfig(env: Env = process.env): StripeConfig | null {
  if (!isOrderWriteEnabled(env)) return null;
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secretKey || !webhookSecret.startsWith("whsec_")) return null;

  const testMode = /^(sk|rk)_test_/.test(secretKey);
  const liveKey = /^(sk|rk)_live_/.test(secretKey);
  if (!testMode && !liveKey) return null;
  if (env.VERCEL_ENV === "production") {
    // Ostrý provoz: jen ostrý klíč — testovací klíč by „zaplatil“ objednávku
    // testovací kartou bez skutečných peněz.
    if (env.ESHOP_STRIPE_LIVE !== "on" || !liveKey) return null;
  } else if (!testMode) {
    return null;
  }
  return { secretKey, webhookSecret, testMode };
}

export function isCardPaymentAvailable(env: Env = process.env): boolean {
  return stripeConfig(env) !== null;
}
