import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { COLD_SHIPPING_RULES, COLD_SHIPPING_SK_BANDS, FUEL_SURCHARGE_PERCENT } from "@/lib/eshop/shippingRates";
import Calculator, { type CalcVariant } from "./Calculator";

// Kalkulačka chlazené přepravy CoolBalík pro ČR a Slovensko (16. 11. 2026).
// Váhy balení bere z katalogu (3 l sirupu v krabici = 3 826 g, polévka 3 kg…).
// Autorizaci (ADMIN/EXECUTIVE) řeší app/rizeni-firmy/layout.tsx.
export const dynamic = "force-dynamic";

export default async function DopravaKalkulackaPage() {
  const result = await db.execute(sql`
    SELECT v.sku, p.name, v.label, v.price_b2c_kc AS price, v.weight_g AS weight
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.is_active = true
    ORDER BY p.name, v.sort_order
  `);
  const variants: CalcVariant[] = (result.rows as { sku: string; name: string; label: string; price: number | null; weight: number | null }[]).map((row) => ({
    sku: row.sku,
    name: `${row.name} ${row.label}`,
    priceKc: row.price === null ? null : Number(row.price),
    weightG: row.weight === null ? null : Number(row.weight),
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div>
        <h1 className="text-2xl font-semibold">Kalkulačka dopravy CoolBalík</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cena = základ dopravce × DPH 21 % × palivový příplatek {FUEL_SURCHARGE_PERCENT} %. Váhy balení jsou z katalogu e-shopu. Na Slovensko e-shop nedoručuje — ceník slouží pro objednávky e-mailem.
        </p>
      </div>
      <Calculator variants={variants} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-2">Ceník Česká republika</h2>
          <table className="w-full text-sm bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr><th className="px-3 py-2 font-medium">Váha</th><th className="px-3 py-2 font-medium text-right">Základ</th><th className="px-3 py-2 font-medium text-right">Cena</th></tr>
            </thead>
            <tbody>
              {COLD_SHIPPING_RULES.map((rule) => (
                <tr key={rule.rule} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-1.5">{rule.label ?? `${rule.fromKg.toLocaleString("cs-CZ")}–${rule.toKg.toLocaleString("cs-CZ")} kg`}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{rule.baseKc.toLocaleString("cs-CZ")} Kč</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{rule.priceKc.toLocaleString("cs-CZ")} Kč</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2 className="font-semibold mb-2">Ceník Slovensko (zóna 3)</h2>
          <table className="w-full text-sm bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr><th className="px-3 py-2 font-medium">Váha do</th><th className="px-3 py-2 font-medium text-right">Základ</th><th className="px-3 py-2 font-medium text-right">Cena</th></tr>
            </thead>
            <tbody>
              {COLD_SHIPPING_SK_BANDS.map((band) => (
                <tr key={band.toKg} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-1.5">{band.toKg} kg</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{band.baseKc.toLocaleString("cs-CZ")} Kč</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{band.priceKc.toLocaleString("cs-CZ")} Kč</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
