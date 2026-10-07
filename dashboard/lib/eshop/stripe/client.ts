import "server-only";
import Stripe from "stripe";
import type { StripeConfig } from "./config";

// Jeden klient na klíč (serverless instance se znovu používá).
let cached: { key: string; client: Stripe } | null = null;

export function getStripe(config: StripeConfig): Stripe {
  if (!cached || cached.key !== config.secretKey) {
    cached = { key: config.secretKey, client: new Stripe(config.secretKey) };
  }
  return cached.client;
}
