import type { PortionPriceRow } from "@/lib/eshop/landingPages";

/** Cena porce polévky včetně dopravy (1 / 3 / 5 begin) — doprava ze stejného ceníku jako košík. */
export default function PortionPriceTable({ rows }: { rows: readonly PortionPriceRow[] }) {
  return (
          <div className="overflow-x-auto rounded-2xl border border-[#EDE5D8]">
      <table className="w-full text-left text-base">
        <thead className="bg-[#FAF6EF] text-sm text-neutral-600">
          <tr>
            <th className="px-4 py-2 font-medium">Objednávka</th>
            <th className="px-4 py-2 font-medium">Porcí po 250 ml</th>
            <th className="px-4 py-2 font-medium">Celkem s dopravou</th>
            <th className="px-4 py-2 font-medium">Porce s dopravou</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.order} className="border-t border-[#EDE5D8]">
              <td className="px-4 py-2 font-semibold">{row.order}</td>
              <td className="px-4 py-2 tabular-nums">{row.portions}</td>
              <td className="px-4 py-2 tabular-nums">{row.totalKc.toLocaleString("cs-CZ")} Kč</td>
              <td className="px-4 py-2 tabular-nums font-semibold">{row.perPortionKc.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
