import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { pragueDate } from "@/lib/eshop/overdueOrders";
import { COMMISSION_PERCENT, COMMISSION_PER_SET_KC, META_CLICK_WINDOW_DAYS, SET_SOURCE_LABELS, halereText, sourceCounts, type SetOrderRow, laterCommissionHalere, monthLabel, monthOf, previousMonth, returningPercent, type CommissionReport } from "@/lib/eshop/setCampaign";
import { loadCampaignStats, loadCommission, loadSetOrders } from "@/lib/eshop/setCampaignServer";
import { SET_CAMPAIGN_LIMIT } from "@/lib/eshop/tastingSet";

// Kampaň „Ochutnávkový set“ (zadání Lucie 17. 11. 2026) — stav kampaně
// a provize pro Josefa. Stejná čísla chodí e-mailem na info@begina.cz
// (provize 1. den v měsíci v 11:00, přehled v sobotu v 10:30).
// Přístup JEN Jaroslav a Lucie (isInvoiceIssuer), jako Ekonomika.
export const dynamic = "force-dynamic";

const kc = (value: number) => `${value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
      {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

function Commission({ report, title }: { report: CommissionReport; title: string }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <h2 className="text-base font-semibold">
        {title} <span className="font-normal text-neutral-500">({monthLabel(report.month)})</span>
      </h2>
      <p className="text-sm">
        Sety za akční cenu: {report.sets} ks × {COMMISSION_PER_SET_KC} Kč = <strong>{halereText(report.setsHalere)}</strong>
      </p>
      <p className="text-sm">
        Další nákupy zákazníků z kampaně ({COMMISSION_PERCENT} % ze zboží po slevě, bez dopravy): <strong>{halereText(report.laterHalere)}</strong>
      </p>
      {report.laterOrders.length > 0 && (
        <ul className="text-sm text-neutral-700 list-disc pl-5">
          {report.laterOrders.map((order) => (
            <li key={order.number}>
              objednávka {order.number}: {kc(order.goodsKc)} → {halereText(laterCommissionHalere(order.goodsKc))}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm border-t border-neutral-100 pt-2">
        Provize celkem: <strong className="text-base">{kc(report.totalKc)}</strong> <span className="text-neutral-500">(zaokrouhleno na celé koruny)</span>
      </p>
    </section>
  );
}

const SOURCE_STYLE: Record<SetOrderRow["source"], string> = {
  meta: "bg-blue-50 text-blue-800 border-blue-200",
  jinde: "bg-neutral-50 text-neutral-700 border-neutral-200",
  neznamo: "bg-white text-neutral-500 border-neutral-200",
};

function SetOrders({ orders }: { orders: SetOrderRow[] }) {
  const counts = sourceCounts(orders);
  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">Odkud přišly objednávky setu</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Jen pro přehled, provize se počítá stejně. „Facebook / Instagram“ = proklik z Facebooku nebo Instagramu do {META_CLICK_WINDOW_DAYS} dní před objednávkou (reklama i běžný příspěvek). Zdroj poznáme jen u zákazníků, kteří povolili reklamní cookies.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {(Object.keys(SET_SOURCE_LABELS) as SetOrderRow["source"][]).map((source) => (
          <span key={source} className={`border rounded-full px-3 py-1 ${SOURCE_STYLE[source]}`}>
            {SET_SOURCE_LABELS[source]}: <strong className="tabular-nums">{counts[source]}</strong>
          </span>
        ))}
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">Zatím žádná objednávka setu.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-100">
                <th className="py-2 pr-3 font-normal">Objednávka</th>
                <th className="py-2 pr-3 font-normal">Datum</th>
                <th className="py-2 pr-3 font-normal">Odkud</th>
                <th className="py-2 pr-3 font-normal">Zákazník</th>
                <th className="py-2 font-normal">Stav</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.number} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 pr-3 tabular-nums">{order.number}</td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{order.orderedAt.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}</td>
                  <td className="py-2 pr-3">
                    <span className={`border rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${SOURCE_STYLE[order.source]}`}>{SET_SOURCE_LABELS[order.source]}</span>
                  </td>
                  <td className="py-2 pr-3">{order.newCustomer ? "nový" : "stávající"}</td>
                  <td className="py-2 whitespace-nowrap">
                    {order.paid ? "zaplaceno" : <span className="text-amber-700">nezaplaceno</span>}
                    {!order.campaignPrice && <span className="text-neutral-500"> · běžná cena</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function KampanSetPage() {
  const auth = await getAuthContext();
  if (!auth || !isInvoiceIssuer(auth)) notFound();
  const today = pragueDate(new Date());
  const [stats, current, previous, setOrders] = await Promise.all([loadCampaignStats(), loadCommission(monthOf(today)), loadCommission(previousMonth(today)), loadSetOrders()]);
  const percent = returningPercent(stats);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div>
        <h1 className="text-2xl font-semibold">Kampaň – Ochutnávkový set</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Provize: {COMMISSION_PER_SET_KC} Kč za každý set prodaný za akční cenu a {COMMISSION_PERCENT} % z dalších nákupů zákazníků, pro které byl akční set první nákup (6 měsíců od první objednávky). Počítají se zaplacené a nestornované objednávky.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tile label="Prodané sety celkem" value={`${stats.setsTotal} ks`} hint={`za posledních 7 dní ${stats.setsWeek} ks`} />
        <Tile label="Za akční cenu" value={`${stats.campaignSold} ze ${SET_CAMPAIGN_LIMIT}`} hint={`zbývá ${Math.max(0, SET_CAMPAIGN_LIMIT - stats.campaignSold)}`} />
        <Tile label="Použití kódu OCHUTNAVKA50" value={`${stats.couponUses}×`} />
        <Tile label="Zákazníci z kampaně" value={String(stats.campaignCustomers)} />
        <Tile label="Znovu nakoupilo" value={percent === null ? "—" : `${percent} %`} hint={`${stats.returningCustomers} zákazníků`} />
      </div>
      <SetOrders orders={setOrders} />
      <Commission report={current} title="Provize – tento měsíc, průběžně" />
      <Commission report={previous} title="Provize – minulý měsíc" />
    </div>
  );
}
