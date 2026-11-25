import Link from "next/link";
import { FUNNEL_STEPS, GOOGLE_LABELS, buildFunnel, segmentSplit, sourceRows, type FunnelStep } from "@/lib/eshop/funnel";
import { loadFunnelDays } from "@/lib/eshop/funnelServer";
import { loadGscSummary } from "@/lib/seo/gscServer";

// MĚŘENÍ E-SHOPU 1.0 (15. 11. 2026) — trychtýř nákupu a konverzní poměr.
// Autorizaci (ADMIN/EXECUTIVE) řeší app/rizeni-firmy/layout.tsx.
export const dynamic = "force-dynamic";

const PERIODS = [7, 14, 30, 90];
const KEYS = [...FUNNEL_STEPS, "order", "paid"] as const;
const fmtPct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("cs-CZ")} %`);
const fmtDay = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export default async function MereniEshopuPage(props: PageProps<"/rizeni-firmy/mereni-eshopu">) {
  const searchParams = await props.searchParams;
  const requested = Number(typeof searchParams.dni === "string" ? searchParams.dni : "");
  const period = PERIODS.includes(requested) ? requested : 14;
  const days = await loadFunnelDays(period);

  if (days === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-neutral-900">
        <h1 className="text-2xl font-semibold">Měření e-shopu</h1>
        <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Tabulka pro měření v databázi ještě není. Spusťte v Neonu skript 117_mereni_eshopu_MAIN.</p>
      </div>
    );
  }

  const totals: Partial<Record<FunnelStep | "order" | "paid", number>> = {};
  for (const day of days) for (const key of KEYS) totals[key] = (totals[key] ?? 0) + (day.counts[key] ?? 0);
  const funnel = buildFunnel(totals);
  const visits = totals.visit ?? 0;
  const paid = totals.paid ?? 0;
  const conversion = visits > 0 ? Math.round((paid / visits) * 1000) / 10 : null;
  const max = Math.max(1, ...funnel.map((row) => row.count));
  const googleVisits = days.reduce((sum, day) => sum + (day.counts.google_visit ?? 0), 0);
  const googleOrders = days.reduce((sum, day) => sum + (day.counts.google_order ?? 0), 0);
  const sources = sourceRows(days);
  const segments = segmentSplit(days);
  const gsc = await loadGscSummary(28).catch(() => null);
  const gscTop = gsc ? gsc.queries.slice(0, 15) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Měření e-shopu</h1>
          <p className="mt-1 text-sm text-neutral-600">Posledních {period} dní včetně dneška. Anonymní součty, bez cookies a bez údajů o návštěvnících.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {PERIODS.map((value) => (
            <Link key={value} href={`/rizeni-firmy/mereni-eshopu?dni=${value}`} className={`rounded-lg px-3 py-1.5 font-medium ${value === period ? "bg-begina-primary-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
              {value} dní
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Konverzní poměr (zaplacené objednávky / návštěvy)</p>
          <p className="mt-1 text-2xl font-semibold">{fmtPct(conversion)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Návštěvy</p>
          <p className="mt-1 text-2xl font-semibold">{visits.toLocaleString("cs-CZ")}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Zaplacené objednávky</p>
          <p className="mt-1 text-2xl font-semibold">{paid.toLocaleString("cs-CZ")}</p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <h2 className="font-semibold">Kavárny a bistra / domácnosti</h2>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <p>Pokladna „Nakupuji na firmu“: <strong>{segments.companyCheckout.toLocaleString("cs-CZ")}</strong></p>
          <p>Zaplaceno kavárny (IČO): <strong>{segments.paidCompany.toLocaleString("cs-CZ")}</strong></p>
          <p>Zaplaceno domácnosti: <strong>{segments.paidHome.toLocaleString("cs-CZ")}</strong></p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <h2 className="font-semibold">Odkud lidé přišli</h2>
        {sources.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">Zatím bez dat — zdroje se měří od 21. 11. 2026.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Zdroj</th>
                <th className="py-1 font-medium text-right">Návštěvy</th>
                <th className="py-1 font-medium text-right">Odeslané objednávky</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={row.source} className="border-t border-neutral-100">
                  <td className="py-1">{row.label}{row.isAi ? " · AI" : ""}</td>
                  <td className="py-1 text-right tabular-nums">{row.visits.toLocaleString("cs-CZ")}</td>
                  <td className="py-1 text-right tabular-nums">{row.orders.toLocaleString("cs-CZ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-neutral-500">Zdroj se pozná z adresy první stránky a ze stránky, odkud člověk klikl. Objednávka se zdroji připíše, jen když ji člověk odešle ve stejné návštěvě. Vlastní zařízení vyřadíte z měření jednorázovým otevřením begina.cz/?nemerit=1 (zpět: ?nemerit=0).</p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <h2 className="font-semibold">Bezplatné výpisy Google</h2>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <p>
            {GOOGLE_LABELS.google_visit}: <strong>{googleVisits.toLocaleString("cs-CZ")}</strong>
          </p>
          <p>
            {GOOGLE_LABELS.google_order}: <strong>{googleOrders.toLocaleString("cs-CZ")}</strong>
          </p>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Proklik z Google se pozná podle značky „srsltid“ v adrese (v Merchant Center musí být zapnuté automatické označování). Bez cookies: když zákazník stránku obnoví nebo přijde později znovu, objednávka se Googlu nepřipíše — číslo je spíš spodní odhad. Počítají se odeslané objednávky, ne jen zaplacené.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Co lidé hledají na Googlu (Search Console)</h2>
          <p className="text-xs text-neutral-500">
            {gsc === null
              ? "Tabulka pro Search Console v databázi ještě není (skript 158)."
              : gsc.lastDay
                ? `Posledních 28 dní do ${fmtDay(gsc.lastDay)} (Google má zpoždění 2–3 dny). Pozice = průměrné místo ve výsledcích, 1 je nahoře.`
                : "Zatím žádná data – stahují se každou noc."}
          </p>
        </div>
        {gscTop.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="py-1.5 font-medium">Hledaný výraz</th>
                <th className="py-1.5 font-medium text-right">Kliknutí</th>
                <th className="py-1.5 font-medium text-right">Zobrazení</th>
                <th className="py-1.5 font-medium text-right">Pozice</th>
              </tr>
            </thead>
            <tbody>
              {gscTop.map((row) => (
                <tr key={row.query} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1.5 pr-3">{row.query}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.clicks}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.impressions}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.position === null ? "—" : row.position.toLocaleString("cs-CZ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">Kde lidé odpadají</h2>
        {funnel.map((row) => (
          <div key={row.key} className="grid grid-cols-[11rem_1fr_auto] items-center gap-3 text-sm">
            <span>{row.label}</span>
            <div className="h-5 rounded bg-neutral-100 overflow-hidden">
              <div className="h-full bg-begina-primary-900" style={{ width: `${Math.max(row.count > 0 ? 1 : 0, (row.count / max) * 100)}%` }} />
            </div>
            <span className="whitespace-nowrap text-right tabular-nums">
              <strong>{row.count.toLocaleString("cs-CZ")}</strong>
              {row.ofPreviousPct !== null && <span className="text-neutral-500"> · {fmtPct(row.ofPreviousPct)} z předchozího</span>}
            </span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-2 font-medium">Den</th>
              {funnel.map((row) => (
                <th key={row.key} className="px-3 py-2 font-medium text-right">{row.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day} className="border-b border-neutral-100 last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDay(day.day)}</td>
                {KEYS.map((key) => (
                  <td key={key} className="px-3 py-2 text-right tabular-nums">{day.counts[key] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Návštěva = jedno načtení e-shopu v prohlížeči (roboti se nepočítají). Každý krok se počítá nejvýš jednou za návštěvu. Počítají se i vaše vlastní návštěvy a zkušební objednávky. Objednávky jsou podle dne vytvoření; měření běží od spuštění, starší dny mají u kroků nuly.
      </p>
    </div>
  );
}
