import "server-only";
import Stripe from "stripe";
import type { StripeConfig } from "./config";

// Jeden klient na klíč (serverless instance se znovu používá).
let cached: { key: string; client: Stripe } | null = null;

type Env = Record<string, string | undefined>;

/**
 * Jen pro test v prohlížeči na vlastním počítači (scripts/eshop-e2e/pending-order.mjs):
 * E2E_STRIPE_API=http://127.0.0.1:port přesměruje volání Stripe na místní
 * napodobeninu. Na Vercelu (VERCEL) ani s ostrým klíčem se nikdy nepoužije.
 */
export function stripeApiOverride(secretKey: string, env: Env = process.env): Stripe.StripeConfig {
  const raw = env.E2E_STRIPE_API?.trim();
  if (!raw || env.VERCEL || !secretKey.startsWith("sk_test_")) return {};
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return {};
  return { host: url.hostname, port: Number(url.port), protocol: url.protocol === "http:" ? "http" : "https" };
}

export function getStripe(config: StripeConfig): Stripe {
  if (!cached || cached.key !== config.secretKey) {
    cached = { key: config.secretKey, client: new Stripe(config.secretKey, stripeApiOverride(config.secretKey)) };
  }
  return cached.client;
}
