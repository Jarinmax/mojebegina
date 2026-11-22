import "server-only";

// Palivový příplatek CoolBalík z MojeBegina (tabulka eshop_settings, 22. 11. 2026).
// Když tabulka ještě není (migrace 0062 nespuštěná) nebo je hodnota neplatná,
// platí výchozí FUEL_SURCHARGE_PERCENT ze shippingRates.ts.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { FUEL_SURCHARGE_PERCENT, applyFuelSurcharge, validFuelPercent } from "./shippingRates";

export const FUEL_SETTING_KEY = "fuel_surcharge_percent";

export async function loadFuelSurchargePercent(): Promise<number> {
  try {
    const result = await db.execute(sql`SELECT value FROM eshop_settings WHERE key = ${FUEL_SETTING_KEY} LIMIT 1`);
    const row = result.rows[0] as { value?: string } | undefined;
    return validFuelPercent(row?.value) ?? FUEL_SURCHARGE_PERCENT;
  } catch (error) {
    console.warn("Palivový příplatek: tabulka eshop_settings nedostupná, platí výchozí", FUEL_SURCHARGE_PERCENT, error instanceof Error ? error.message : error);
    return FUEL_SURCHARGE_PERCENT;
  }
}

/** Načte příplatek z DB a přepočítá ceník dopravy; vrací platné procento. */
export async function applyFuelSurchargeFromDb(): Promise<number> {
  const percent = await loadFuelSurchargePercent();
  applyFuelSurcharge(percent);
  return percent;
}

export async function saveFuelSurchargePercent(percent: number, userId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO eshop_settings (key, value, updated_at, updated_by)
    VALUES (${FUEL_SETTING_KEY}, ${String(percent)}, now(), ${userId})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
  `);
  applyFuelSurcharge(percent);
}
