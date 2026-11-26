import Link from "next/link";
import { OVERDUE_WORKING_DAYS, dateText, type OverdueRow } from "@/lib/eshop/overdueOrders";
import { loadOverdueReport } from "@/lib/eshop/overdueOrdersServer";

// Objednávky po termínu (zadání Lucie 17. 11. 2026) — stejný seznam jako
// e-mail na info@begina.cz v 11:00. Autorizaci řeší app/rizeni-firmy/layout.tsx.
export const dynamic = "force-dynamic";

function Section({ title, hint, sinceLabel, rows }: { title: string; hint: string; sinceLabel: string; rows: OverdueRow[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">
        {title} <span className="text-neutral-500 font-normal">({rows.length})</span>
      </h2>
      <p className="text-sm text-neutral-600">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm rounded-lg bg-emerald-50 text-emerald-900 px-3 py-2">Nic po termínu.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/rizeni-firmy/objednavky/${row.id}`}
                className="block bg-white border border-red-200 border-l-4 border-l-red-500 rounded-xl p-4 hover:border-red-300"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {row.number} <span className="text-xs text-neutral-500 font-normal">{row.channelLabel}</span>
                  </p>
                  <p className="text-sm font-semibold text-red-700">{row.workingDays} prac. dnů</p>
                </div>
                <p className="text-sm text-neutral-800">{row.customer}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  {sinceLabel} {dateText(row.since)} · {row.statusLabel}
                  {row.carrier ? ` (${row.carrier})` : ""} · {row.totalKc.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ObjednavkyPoTerminuPage() {
  const report = await loadOverdueReport();
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div>
        <h1 className="text-2xl font-semibold">Objednávky po termínu</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Stav k {dateText(report.today)}. Počítají se pracovní dny bez víkendů a státních svátků. Upozornění chodí na info@begina.cz každý pracovní den v 11:00, jen když je co hlásit.
        </p>
      </div>
      <Section
        title={`Zaplacené a nedoručené déle než ${OVERDUE_WORKING_DAYS} pracovních dnů`}
        hint="Obchodní podmínky slibují odeslání do 5 pracovních dnů. Když už je objednávka doručená, označte ji jako doručenou."
        sinceLabel="Uhrazeno"
        rows={report.unshipped}
      />
      <Section
        title={`Odeslané déle než ${OVERDUE_WORKING_DAYS} pracovních dnů, neoznačené jako doručené`}
        hint="Bez označení „doručeno“ zákazník nedostane žádost o hodnocení."
        sinceLabel="Odesláno"
        rows={report.undelivered}
      />
    </div>
  );
}
