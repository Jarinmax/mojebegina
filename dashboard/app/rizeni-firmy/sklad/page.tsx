import Link from "next/link";
import { listConfirmedReceiptsOverview, listRecentStockIssues, listStockBalances, type StockBalance } from "@/lib/data/sklad";

// SKLAD — PŘEHLEDNĚ (Lucie 25. 11. 2026): „je to nepřehledný, nerozumím tomu“.
// Nahoře jedna věta + hodnota skladu, pak tabulky Suroviny / Obaly
// (kolik je, za kolik, hodnota) a pod tím poslední příjmy (datum, od koho,
// co, cena). Rozpracované návrhy ze starého focení dokladů se neukazují.

const kc = (value: number) => `${value.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Kč`;
const unitKc = (value: number) =>
  `${value.toLocaleString("cs-CZ", { minimumFractionDigits: value < 10 ? 2 : 0, maximumFractionDigits: 2 })} Kč`;
const qty = (value: number) => value.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("cs-CZ") : "–");

function StockTable({ title, rows }: { title: string; rows: StockBalance[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + (r.valueKc ?? 0), 0);
  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-begina-primary-900 mb-2">{title}</h2>
      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
              <th className="px-4 py-2 font-medium">Položka</th>
              <th className="px-4 py-2 font-medium text-right">Skladem</th>
              <th className="px-4 py-2 font-medium text-right">Cena za jednotku</th>
              <th className="px-4 py-2 font-medium text-right">Hodnota</th>
              <th className="px-4 py-2 font-medium text-right">Naposledy přijato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-2.5 text-begina-primary-900">{r.name}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                  {qty(r.quantity)} {r.unit}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-neutral-700">
                  {r.unitPriceKc === null ? "–" : `${unitKc(r.unitPriceKc)} / ${r.unit}`}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{r.valueKc === null ? "–" : kc(r.valueKc)}</td>
                <td className="px-4 py-2.5 text-right text-neutral-500 whitespace-nowrap">{date(r.lastReceipt)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200">
              <td className="px-4 py-2 text-neutral-500" colSpan={3}>
                Celkem {title.toLowerCase()}
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">{kc(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default async function SkladPage() {
  const [balances, { receipts, draftCount }, issues] = await Promise.all([listStockBalances(), listConfirmedReceiptsOverview(), listRecentStockIssues()]);
  const materials = balances.filter((b) => b.kind === "stock_material");
  const supplies = balances.filter((b) => b.kind === "operating_supply");
  const others = balances.filter((b) => b.kind !== "stock_material" && b.kind !== "operating_supply");
  const totalValue = balances.reduce((sum, b) => sum + (b.valueKc ?? 0), 0);

  return (
    <div>
      <div className="mt-3 mb-5">
        <h1 className="text-lg font-semibold text-begina-primary-900">Sklad surovin a obalů</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Co máme na skladě a za kolik. Ceny jsou včetně dopravy. Nákupy zapisuje asistent ve vlákně „Příjem surovin a obalů“, obaly se odečítají samy při expedici objednávky.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Hodnota skladu</p>
          <p className="text-xl font-semibold text-begina-primary-900 tabular-nums">{kc(totalValue)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Položek skladem</p>
          <p className="text-xl font-semibold text-begina-primary-900 tabular-nums">{balances.filter((b) => b.quantity > 0).length}</p>
        </div>
      </div>

      {balances.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600 mb-6">Sklad je zatím prázdný.</div>
      ) : (
        <>
          <StockTable title="Suroviny" rows={materials} />
          <StockTable title="Obaly" rows={supplies} />
          <StockTable title="Ostatní" rows={others} />
        </>
      )}

      {issues.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-begina-primary-900 mb-2">Poslední výdeje</h2>
          <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Položka</th>
                  <th className="px-4 py-2 font-medium text-right">Množství</th>
                  <th className="px-4 py-2 font-medium">Proč</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {issues.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700">{date(m.date)}</td>
                    <td className="px-4 py-2.5 text-begina-primary-900">{m.item}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${m.direction === "out" ? "text-red-700" : "text-green-700"}`}>
                      {m.direction === "out" ? "−" : "+"}
                      {qty(m.quantity)} {m.unit}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{m.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-base font-semibold text-begina-primary-900 mb-2">Poslední příjmy</h2>
        {receipts.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">Zatím žádný příjem.</div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Od koho</th>
                  <th className="px-4 py-2 font-medium">Co</th>
                  <th className="px-4 py-2 font-medium text-right">Cena</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700">{date(r.date)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/rizeni-firmy/sklad/prijemky/${r.id}`} className="text-begina-primary-900 hover:underline">
                        {r.supplier}
                      </Link>
                      {r.documentNumber ? <span className="block text-xs text-neutral-400">{r.documentNumber}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">{r.items}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{kc(r.totalKc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {draftCount > 0 ? (
          <p className="text-xs text-neutral-400 mt-2">
            {draftCount} nedokončené návrhy ze starého focení dokladů jsou skryté (nejsou na skladě).
          </p>
        ) : null}
      </section>
    </div>
  );
}
