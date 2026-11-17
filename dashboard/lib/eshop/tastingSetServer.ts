import "server-only";

// Ochutnávkový set sirupů — počítadlo setů prodaných za úvodní cenu
// a rozhodnutí, které balení setu zákazník vidí (viz tastingSet.ts).
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { SET_CAMPAIGN_SKU, SET_LAUNCHED, SET_PREVIEW_COOKIE, SET_PREVIEW_VALUE, SET_SKU, campaignRemaining, isTastingSet } from "./tastingSet";
import type { Product } from "./types";

/** Po kolika dnech se nezaplacený set vrací do počítadla. */
export const UNPAID_RETURN_DAYS = 7;

/**
 * Sety za úvodní cenu, které se počítají do stovky: objednané v e-shopu,
 * nestornované; nezaplacená objednávka se po 7 dnech přestane počítat
 * (set se „vrátí“). null = počet se nepodařilo zjistit.
 */
export async function soldCampaignSets(): Promise<number | null> {
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(sum(oi.quantity), 0)::int AS sold
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku_snapshot = ${SET_CAMPAIGN_SKU}
        AND o.fulfillment_status <> 'cancelled'
        AND (o.payment_status = 'paid' OR o.ordered_at > now() - make_interval(days => ${UNPAID_RETURN_DAYS}))
    `);
    return Number((result.rows?.[0] as { sold?: number } | undefined)?.sold ?? 0);
  } catch (error) {
    console.error("Ochutnávkový set: počítadlo se nepodařilo načíst", String(error).slice(0, 200));
    return null;
  }
}

/** Je set vidět? Po spuštění všem, před ním jen náhledu s cookie. */
export async function setVisible(): Promise<boolean> {
  if (SET_LAUNCHED) return true;
  try {
    return (await cookies()).get(SET_PREVIEW_COOKIE)?.value === SET_PREVIEW_VALUE;
  } catch {
    return false;
  }
}

/**
 * Upraví produkty katalogu: set skryje (před spuštěním), nebo mu nechá jen
 * jedno balení — úvodní cenu, dokud zbývají kusy ze 100, jinak běžnou.
 * Když počítadlo nejde načíst, úvodní cena se z opatrnosti nenabízí.
 */
export async function applyTastingSet(products: Product[]): Promise<Product[]> {
  const set = products.find(isTastingSet);
  if (!set) return products;
  if (!(await setVisible())) return products.filter((product) => !isTastingSet(product));
  const campaign = set.variants.find((variant) => variant.sku === SET_CAMPAIGN_SKU);
  const regular = set.variants.find((variant) => variant.sku === SET_SKU);
  const sold = campaign ? await soldCampaignSets() : null;
  const remaining = sold === null ? 0 : campaignRemaining(sold);
  const variant = campaign && remaining > 0 ? campaign : regular;
  if (!variant) return products.filter((product) => !isTastingSet(product));
  return products.map((product) =>
    isTastingSet(product)
      ? { ...product, variants: [variant], tastingCampaign: variant === campaign ? { remaining } : undefined }
      : product
  );
}
