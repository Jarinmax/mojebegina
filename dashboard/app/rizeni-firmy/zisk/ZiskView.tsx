import Link from "next/link";
import PenizeTabs from "../_penize/PenizeTabs";
import { MONTH_NAMES } from "@/lib/ekonomika/economy";
import type { IngredientUse, MonthProfit } from "@/lib/ekonomika/beginaProfit";

const kc = (n: number) => `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} Kč`;
const num = (n: number, unit: string) =>
  `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: unit === "ks" || unit === "kapka" ? 0 : n < 1 ? 3 : 2 }).format(n)} ${unit}`;
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : "—");
const BASE = "/rizeni-firmy/zisk";

export default function ZiskView({ year, nowYear: nowY, months, selectedMonth }: { year: number; nowYear: number; months: MonthProfit[]; selectedMonth: number | null }) {
  const selected = months.find((m) => m.month === selectedMonth) ?? months[0];
  const net = (m: MonthProfit) => m.revenueKc - m.shippingKc;
  const profit = (m: MonthProfit) => net(m) - m.ingredientsKc - m.packagingKc;
  const total = months.reduce(
    (t, m) => ({ net: t.net + net(m), ing: t.ing + m.ingredientsKc, pack: t.pack + m.packagingKc, profit: t.profit + profit(m) }),
    { net: 0, ing: 0, pack: 0, profit: 0 },
  );
  const years = Array.from({ length: nowY - 2020 + 1 }, (_, i) => nowY - i);
  const pill = (active: boolean) =>
    `text-sm rounded-full border px-4 py-2 ${active ? "bg-begina-primary-900 text-white border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`;

  return (
    <div className="max-w-5xl">
      <PenizeTabs active="zisk" />
      <p className="text-sm text-neutral-600 mb-3">
        Tržba Beginy bez dopravy, minus suroviny a obaly podle receptur (dnešní ceny z Nákladů a marží). Klikni na měsíc – uvidíš, kolik čeho jsme spotřebovali.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {years.map((y) => (
          <Link key={y} href={`${BASE}?rok=${y}`} className={pill(y === year)}>
            {y}
          </Link>
        ))}
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-neutral-500">V roce {year} nejsou žádné faktury Beginy.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white mb-5">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr>
                  <th className="text-left px-3 py-2">Měsíc</th>
                  <th className="text-right px-3 py-2">Tržba bez dopravy</th>
                  <th className="text-right px-3 py-2">Suroviny</th>
                  <th className="text-right px-3 py-2">Obaly</th>
                  <th className="text-right px-3 py-2">Zisk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {months.map((m) => {
                  const active = m.month === selected?.month;
                  return (
                    <tr key={m.month} className={active ? "bg-emerald-50" : "hover:bg-neutral-50"}>
                      <td className="px-3 py-2">
                        <Link href={`${BASE}?rok=${year}&mesic=${m.month}`} className="font-semibold text-begina-primary-900 underline-offset-2 hover:underline capitalize">
                          {MONTH_NAMES[m.month - 1]}
                        </Link>
                        {m.unknown.length > 0 && <span className="ml-1 text-xs text-amber-700" title="Část prodejů bez receptu">⚠</span>}
                      </td>
                      <td className="text-right px-3 py-2 whitespace-nowrap">{kc(net(m))}</td>
                      <td className="text-right px-3 py-2 whitespace-nowrap text-red-700">− {kc(m.ingredientsKc)}</td>
                      <td className="text-right px-3 py-2 whitespace-nowrap text-red-700">− {kc(m.packagingKc)}</td>
                      <td className="text-right px-3 py-2 whitespace-nowrap font-semibold text-emerald-800">
                        {kc(profit(m))} <span className="text-xs font-normal text-neutral-500">{pct(profit(m), net(m))}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-neutral-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Celkem {year}</td>
                  <td className="text-right px-3 py-2 whitespace-nowrap">{kc(total.net)}</td>
                  <td className="text-right px-3 py-2 whitespace-nowrap text-red-700">− {kc(total.ing)}</td>
                  <td className="text-right px-3 py-2 whitespace-nowrap text-red-700">− {kc(total.pack)}</td>
                  <td className="text-right px-3 py-2 whitespace-nowrap text-emerald-800">
                    {kc(total.profit)} <span className="text-xs font-normal text-neutral-500">{pct(total.profit, total.net)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selected && <MonthDetail m={selected} year={year} net={net(selected)} profit={profit(selected)} />}
        </>
      )}
    </div>
  );
}

function MonthDetail({ m, year, net, profit }: { m: MonthProfit; year: number; net: number; profit: number }) {
  const ing = m.uses.filter((u) => u.kind === "surovina");
  const pack = m.uses.filter((u) => u.kind === "obal");
  const unknownKc = m.unknown.reduce((s, u) => s + u.totalKc, 0);
  return (
    <section>
      <h2 className="text-lg font-semibold text-begina-primary-900 mb-2 capitalize">
        {MONTH_NAMES[m.month - 1]} {year}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Tile label="Tržba bez dopravy" value={kc(net)} sub={`doprava ${kc(m.shippingKc)}`} tone="border-l-emerald-600" />
        <Tile label="Suroviny" value={kc(m.ingredientsKc)} tone="border-l-red-500" />
        <Tile label="Obaly" value={kc(m.packagingKc)} tone="border-l-red-300" />
        <Tile label="Zisk po surovinách a obalech" value={kc(profit)} sub={pct(profit, net)} tone="border-l-emerald-800" />
      </div>
      <UseTable title="🥕 Spotřeba surovin" hint="Tolik jsme podle receptur za měsíc spotřebovali – orientačně tolik je potřeba nakoupit." rows={ing} />
      <UseTable title="📦 Obaly" rows={pack} />
      {m.unknown.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h3 className="font-semibold text-amber-950">⚠ Prodeje, u kterých neznáme náklad – {kc(unknownKc)}</h3>
          <p className="text-xs text-amber-900 mb-2">Pro tyhle výrobky není v MojeBegině recept (zmrzliny, milkshake, latte…), takže nevíme, kolik stály suroviny. Zisk je o jejich suroviny ve skutečnosti nižší. Když recept doplníte do Nákladů a marží, započítá se sám.</p>
          <ul className="text-sm divide-y divide-amber-200">
            {m.unknown.map((u, i) => (
              <li key={i} className="flex justify-between gap-3 py-1">
                <span>
                  {u.name} <span className="text-neutral-600">× {num(u.quantity, "ks")}</span>
                </span>
                <span className="tabular-nums whitespace-nowrap">{kc(u.totalKc)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`bg-white border border-neutral-200 border-l-8 ${tone} rounded-xl p-3`}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-semibold text-begina-primary-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-neutral-500 tabular-nums">{sub}</p>}
    </div>
  );
}

function UseTable({ title, hint, rows }: { title: string; hint?: string; rows: IngredientUse[] }) {
  if (rows.length === 0) return null;
  const sum = rows.reduce((s, r) => s + r.costKc, 0);
  return (
    <div className="mb-4 rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 border-b border-neutral-100">
        <div>
          <h3 className="font-semibold text-begina-primary-900">{title}</h3>
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
        <p className="font-semibold tabular-nums whitespace-nowrap">{kc(sum)}</p>
      </div>
      <table className="w-full text-sm tabular-nums">
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">{num(r.quantity, r.unit)}</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">{kc(r.costKc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
