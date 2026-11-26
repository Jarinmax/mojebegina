import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { MONTH_NAMES, formatKc, formatCzDate, type EconomyRow } from "@/lib/ekonomika/economy";
import { loadEconomyYear } from "@/lib/ekonomika/economyServer";
import { listMonthDocuments, type DocumentRow } from "@/lib/doklady/documents";
import DocUpload from "./DocUpload";
import { noDocumentReason } from "@/lib/doklady/noDocument";
import PenizeTabs from "../_penize/PenizeTabs";
import MonthPicker from "../_penize/MonthPicker";
import { assignDocumentAction, removeDocumentAction, unassignDocumentAction } from "./actions";

// DOKLADY (Lucie 19. 11. 2026) — faktury po rocích a měsících jako ve
// složkách v Macu: Příjmy = vydané faktury z iDokladu (obě řady, PDF ke
// stažení), Náklady = řádky Ekonomiky + nahrané PDF/fotky dokladů.
// Přístup jen Jaroslav a Lucie (jako Ekonomika).
export const dynamic = "force-dynamic";

const BASE = "/rizeni-firmy/doklady";
const pragueYm = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" });


export default async function DokladyPage(props: PageProps<"/rizeni-firmy/doklady">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  const sp = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [nowY, nowM] = pragueYm.format(new Date()).split("-").map(Number);
  const year = Math.min(Math.max(Number(first(sp.rok)) || nowY, 2025), nowY);
  const month = Math.min(Math.max(Number(first(sp.mesic)) || (year === nowY ? nowM : 12), 1), year === nowY ? nowM : 12);
  // Příjmy jsou od 26. 11. 2026 na jedné stránce Příjmy – faktury (nové i starší faktury v jednom měsíci).
  if (first(sp.tab) === "prijmy") redirect(`/rizeni-firmy/faktury?rok=${year}&mesic=${month}`);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const href = (y: number, m: number) => `${BASE}?rok=${y}&mesic=${m}&tab=naklady`;

  const [economy, docs] = await Promise.all([loadEconomyYear(year), listMonthDocuments(ym)]);
  // Nejnovější náklady nahoře (Lucie 23. 11. 2026).
  const costs = economy
    .filter((r: EconomyRow) => r.kind === "cost" && r.entryDate.slice(0, 7) === ym)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  const costTotalHal = costs.reduce((s, r) => s + r.amountHal, 0);

  const docsByEntry = new Map<string, DocumentRow[]>();
  const unassigned: DocumentRow[] = [];
  for (const d of docs) {
    if (d.entryId && costs.some((c) => c.id === d.entryId)) docsByEntry.set(d.entryId, [...(docsByEntry.get(d.entryId) ?? []), d]);
    else unassigned.push(d);
  }
  const withDoc = costs.filter((c) => docsByEntry.has(c.id)).length;

  return (
    <div>
      <PenizeTabs active="uctenky" />
      <p className="text-sm text-neutral-600 mb-3">Účtenky a faktury za nákupy po měsících — přicházejí z vlákna Účtenky, nebo je nahraješ tady.</p>
      <MonthPicker year={year} month={month} nowYear={nowY} nowMonth={nowM} minYear={2025} href={href} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 bg-white border border-neutral-200 rounded-xl p-3">
        <div>
          <p className="text-xs text-neutral-500 capitalize">Náklady – {MONTH_NAMES[month - 1]} {year}</p>
          <p className="text-lg font-semibold text-begina-primary-900">{formatKc(costTotalHal)}</p>
          <p className="text-xs text-neutral-500">{costs.length} položek, doklad u {withDoc}</p>
        </div>
        <a href={`${BASE}/zip?mesic=${ym}&typ=vse`} className="text-sm font-medium text-white bg-begina-primary-900 rounded-lg px-4 py-2">
          Stáhnout vše (ZIP)
        </a>
      </div>

      {(
        <div>
          <DocUpload month={ym} />
          {unassigned.length > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm font-medium text-amber-900 mb-1">Nepřiřazené doklady ({unassigned.length}) — vyber, ke kterému nákladu patří</p>
              <ul className="flex flex-col gap-2">
                {unassigned.map((d) => (
                  <li key={d.id} className="bg-white rounded-lg border border-amber-200 p-2 flex flex-wrap items-center gap-2">
                    <a href={`${BASE}/soubor/${d.id}`} target="_blank" rel="noreferrer" className="text-sm underline text-begina-primary-900 break-all flex-1 min-w-[10rem]">
                      {d.filename}
                    </a>
                    <form action={assignDocumentAction.bind(null, d.id)} className="flex flex-wrap gap-2 items-center">
                      <select name="entryId" required className="text-sm border border-neutral-300 rounded-lg px-2 py-2 max-w-[16rem] bg-white">
                        <option value="">Vyber náklad…</option>
                        {costs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {formatCzDate(c.entryDate).replace(/ \d{4}$/, "")} · {c.counterparty ?? c.title} · {formatKc(c.amountHal)}
                          </option>
                        ))}
                      </select>
                      <button className="text-sm font-medium text-white bg-begina-primary-900 rounded-lg px-3 py-2">Přiřadit</button>
                    </form>
                    <form action={removeDocumentAction.bind(null, d.id)}>
                      <button className="text-xs text-red-700 underline px-1 py-2">Odebrat</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {costs.length === 0 && <p className="text-sm text-neutral-600 mt-3">V tomto měsíci není v Ekonomice zapsaný žádný náklad.</p>}
          <ul className="flex flex-col gap-1.5 mt-3">
            {costs.map((c) => {
              const attached = docsByEntry.get(c.id) ?? [];
              return (
                <li key={c.id} className="bg-white border border-neutral-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-sm text-begina-primary-900 break-words">
                      <b>{c.counterparty ?? "—"}</b> · {c.title}
                    </p>
                    <p className="text-xs text-neutral-600 break-words">
                      {formatCzDate(c.entryDate).replace(/ \d{4}$/, "")}
                      {c.invoiceNumber ? ` · faktura ${c.invoiceNumber}` : ""}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                    {attached.map((d) => (
                      <div key={d.id} className="text-xs mt-0.5 flex flex-wrap gap-x-3">
                        <a href={`${BASE}/soubor/${d.id}`} target="_blank" rel="noreferrer" className="underline text-emerald-700 break-all">
                          📎 {d.filename}
                        </a>
                        <form action={unassignDocumentAction.bind(null, d.id)} className="inline">
                          <button className="text-neutral-500 underline">odpojit</button>
                        </form>
                      </div>
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-begina-primary-900 whitespace-nowrap">{formatKc(c.amountHal)}</span>
                  {attached.length > 0 ? (
                    <a href={`${BASE}/soubor/${attached[0].id}`} target="_blank" rel="noreferrer" className="text-xs font-medium rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1.5">
                      PDF ⬇
                    </a>
                  ) : noDocumentReason(c.note) ? (
                    <span className="text-xs font-medium rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 px-2 py-1.5 whitespace-nowrap">
                      bez dokladu · {noDocumentReason(c.note)}
                    </span>
                  ) : (
                    <DocUpload month={ym} entryId={c.id} compact />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
