import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { KIND_LABELS, PROJECT_AREAS, PROJECT_GROUPS, findArea, formatCzDate } from "@/lib/projekt/areas";
import { loadOverview, projectTableExists } from "@/lib/projekt/projectServer";
import AreaIcon, { TONES } from "./AreaIcon";

// PROJEKT BEGINA 1.0 (17. 11. 2026) — sdílená paměť firmy: oblasti (jedna = jedno vlákno),
// v každé stav, rozhodnutí a výstupy. Zapisuje i asistent („zapiš to“).
// Přístup JEN Jaroslav a Lucie (isInvoiceIssuer); ostatním stránka neexistuje.
export const dynamic = "force-dynamic";

const BASE = "/rizeni-firmy/projekt";

export default async function ProjektPage() {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  if (!(await projectTableExists())) {
    return (
      <div className="max-w-3xl mx-auto py-4 text-neutral-900">
        <h1 className="text-2xl font-semibold">Projekt Begina</h1>
        <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Tabulka pro Projekt Begina v databázi ještě není. Spusťte v Neonu skript 125_projekt_begina_MAIN.</p>
      </div>
    );
  }

  const { areas, recent } = await loadOverview(5);

  return (
    <div className="flex flex-col gap-6 text-neutral-900">
      <div>
        <h1 className="mt-1 text-2xl font-semibold">Projekt Begina</h1>
        <p className="mt-1 text-sm text-neutral-600">Tady si asistent zapisuje, co jsme rozhodli a co je hotové, aby to věděl v každém vláknu. Nemusíš tu nic dělat — stačí mu říct „zapiš to“.</p>
      </div>

      {PROJECT_GROUPS.map((group) => (
        <section key={group}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">{group}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROJECT_AREAS.filter((area) => area.group === group).map((area) => {
              const summary = areas.find((a) => a.slug === area.slug)!;
              const tone = TONES[area.tone];
              return (
                <Link key={area.slug} href={`${BASE}/${area.slug}`} className={`flex flex-col gap-2 rounded-2xl border p-3 transition-colors ${tone.tile}`}>
                  <div className="flex items-center gap-3">
                    <AreaIcon area={area} />
                    <div className="min-w-0">
                      <p className={`font-semibold ${tone.text}`}>{area.name}</p>
                      <p className="text-xs text-neutral-500">
                        {summary.decisions} rozhodnutí · {summary.outputs} výstupů
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-700 line-clamp-2 whitespace-pre-line">{summary.status?.body ?? <span className="text-neutral-400">Zatím bez stavu.</span>}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section>
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Posledních 5 zápisů</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">Zatím tu nic není. Až Claudovi řeknete „zapiš to“, objeví se to tady.</p>
        ) : (
          <ul className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
            {recent.map((entry) => {
              const area = findArea(entry.area);
              return (
                <li key={entry.id}>
                  <Link href={`${BASE}/${entry.area}`} className="flex items-start gap-3 p-3 hover:bg-neutral-50">
                    {area && <AreaIcon area={area} />}
                    <div className="min-w-0">
                      <p className="text-xs text-neutral-500">
                        {area?.name} · {KIND_LABELS[entry.kind]} · {formatCzDate(entry.entryDate)}
                      </p>
                      <p className="text-sm text-neutral-900 line-clamp-2">{entry.title ?? entry.body}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
