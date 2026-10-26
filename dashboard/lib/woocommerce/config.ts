// Objednávky z WooCommerce (begina.cz) — appka dosud NEMĚLA žádný
// automatický příjem objednávek z WooCommerce (jen ruční jednorázové
// importy skriptem, viz docs/eshop-production/62_food_fest_5215.sql).
// Tenhle webhook je PRVNÍ taková automatizace, ne oprava regrese.
//
// Vypnutý (Response 404), dokud nemá appka WOOCOMMERCE_WEBHOOK_SECRET —
// stejný princip jako Stripe (lib/eshop/stripe/config.ts). Sekret se
// zadává i do WooCommerce (Nastavení e-shopu → Rozšířené → Webhooky →
// upravit webhook → „Tajný klíč“) — musí být stejný na obou stranách.
type Env = Record<string, string | undefined>;

export type WooCommerceConfig = { webhookSecret: string };

export function woocommerceConfig(env: Env = process.env): WooCommerceConfig | null {
  const webhookSecret = env.WOOCOMMERCE_WEBHOOK_SECRET?.trim() ?? "";
  if (webhookSecret.length < 32) return null;
  return { webhookSecret };
}
