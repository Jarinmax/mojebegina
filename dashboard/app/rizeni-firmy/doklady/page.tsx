import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray, isNotNull, and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, orders, organizations } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { MONTH_NAMES, formatKc, formatCzDate, type EconomyRow } from "@/lib/ekonomika/economy";
import { loadEconomyYear } from "@/lib/ekonomika/economyServer";
import { listMonthDocuments, type DocumentRow } from "@/lib/doklady/documents";
import { idokladInvoicePdfPath, runIdokladRead } from "@/lib/idoklad-read/tools";
import type { InvoiceSummary } from "@/lib/idoklad-read/service";
import DocUpload from "./DocUpload";
import { noDocumentReason } from "@/lib/doklady/noDocument";
import PenizeTabs from "../_penize/PenizeTabs";
import { assignDocumentAction, removeDocumentAction, unassignDocumentAction } from "./actions";

// DOKLADY (Lucie 19. 11. 2026) — faktury po rocích a měsících jako ve
// složkách v Macu: Příjmy = vydané faktury z iDokladu (obě řady, PDF ke
// stažení), Náklady = řádky Ekonomiky + nahrané PDF/fotky dokladů.
// Přístup jen Jaroslav a Lucie (jako Ekonomika).
export const dynamic = "force-dynamic";

const BASE = "/rizeni-firmy/doklady";
const pragueYm = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" });

function lastDay(year: number, month: number): string {
  return String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
}

const kc = (n: number) => `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} Kč`;

export default async function DokladyPage(props: PageProps<"/rizeni-firmy/doklady">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  const sp = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [nowY, nowM] = pragueYm.format(new Date()).split("-").map(Number);
  const year = Math.min(Math.max(Number(first(sp.rok)) || nowY, 2025), nowY + 1);
  const month = Math.min(Math.max(Number(first(sp.mesic)) || (year === nowY ? nowM : 12), 1), 12);
  const tab = first(sp.tab) === "prijmy" ? "prijmy" : "naklady";
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const href = (y: number, m: number, t = tab) => `${BASE}?rok=${y}&mesic=${m}&tab=${t}`;

  const [read, economy, docs] = await Promise.all([
    runIdokladRead("idoklad_search_invoices", { date_from: `${ym}-01`, date_to: `${ym}-${lastDay(year, month)}`, limit: 100 }, "ui"),
    loadEconomyYear(year),
    listMonthDocuments(ym),
  ]);
  const issued: InvoiceSummary[] = read.ok ? ((read.data.invoices as InvoiceSummary[]) ?? []) : [];
  const issuedTruncated = read.ok && read.data.truncated === true;
  // Nejnovější náklady nahoře (Lucie 23. 11. 2026).
  const costs = economy
    .filter((r: EconomyRow) => r.kind === "cost" && r.entryDate.slice(0, 7) === ym)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  const incomeTotal = issued.reduce((s, i) => s + (i.totalKc ?? 0), 0);
  const costTotalHal = costs.reduce((s, r) => s + r.amountHal, 0);

  // propojení faktur s objednávkami a kartami klientů
  const numbers = issued.map((i) => i.number).filter(Boolean);
  const icos = [...new Set(issued.map((i) => i.partner.ico).filter((v): v is string => Boolean(v)))];
  const [orderLinks, orgLinks] = await Promise.all([
    numbers.length
      ? db
          .select({ number: invoices.invoiceNumber, orderId: orders.id, orderNumber: orders.orderNumber })
          .from(invoices)
          .innerJoin(orders, eq(orders.id, invoices.orderId))
          .where(and(inArray(invoices.invoiceNumber, numbers), isNotNull(invoices.orderId)))
      : Promise.resolve([]),
    icos.length ? db.select({ id: organizations.id, ico: organizations.ico }).from(organizations).where(inArray(organizations.ico, icos)) : Promise.resolve([]),
  ]);
  const orderByNumber = new Map(orderLinks.map((o) => [o.number, o]));
  const orgByIco = new Map(orgLinks.map((o) => [o.ico, o.id]));

  const docsByEntry = new Map<string, DocumentRow[]>();
  const unassigned: DocumentRow[] = [];
  for (const d of docs) {
    if (d.entryId && costs.some((c) => c.id === d.entryId)) docsByEntry.set(d.entryId, [...(docsByEntry.get(d.entryId) ?? []), d]);
    else unassigned.push(d);
  }
  const withDoc = costs.filter((c) => docsByEntry.has(c.id)).length;

  return (
    <div>
      <PenizeTabs active={tab === "naklady" ? "uctenky" : "faktury"} />
      {tab === "prijmy" ? (
        <div className="flex gap-2 mb-3">
          <Link href="/rizeni-firmy/faktury" className="text-sm rounded-full border px-4 py-2 bg-white text-begina-primary-900 border-neutral-300">Nové (MojeBegina)</Link>
          <span className="text-sm rounded-full border px-4 py-2 bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900">Starší z iDokladu (po měsících)</span>
        </div>
      ) : (
        <p className="text-sm text-neutral-600 mb-3">
          Účtenky a faktury za nákupy po měsících — přicházejí z vlákna Účtenky, nebo je nahraješ tady.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-2">
        {[nowY - 1, nowY, ...(nowM === 12 ? [nowY + 1] : [])].filter((y) => y >= 2025).map((y) => (
          <Link key={y} href={href(y, y === nowY ? nowM : 12)} className={`text-sm rounded-full border px-4 py-2 ${y === year ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`}>
            {y}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {MONTH_NAMES.map((name, i) => {
          const m = i + 1;
          const future = year > nowY || (year === nowY && m > nowM);
          return future ? (
            <span key={name} className="text-sm rounded-full border px-3 py-1.5 bg-neutral-50 text-neutral-400 border-neutral-200 capitalize">{name}</span>
          ) : (
            <Link key={name} href={href(year, m)} className={`text-sm rounded-full border px-3 py-1.5 capitalize ${m === month ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`}>
              {name}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500 capitalize">Příjmy – {MONTH_NAMES[month - 1]}</p>
          <p className="text-lg font-semibold text-begina-primary-900">{read.ok ? kc(incomeTotal) : "—"}</p>
          <p className="text-xs text-neutral-500">{read.ok ? `${issued.length} faktur z iDokladu` : "iDoklad se nepodařilo načíst"}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500 capitalize">Náklady – {MONTH_NAMES[month - 1]}</p>
          <p className="text-lg font-semibold text-begina-primary-900">{formatKc(costTotalHal)}</p>
          <p className="text-xs text-neutral-500">{costs.length} řádků, doklad u {withDoc}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-neutral-500">Rozdíl</p>
          <p className={`text-lg font-semibold ${incomeTotal * 100 - costTotalHal < 0 ? "text-red-700" : "text-emerald-700"}`}>
            {read.ok ? formatKc(Math.round(incomeTotal * 100) - costTotalHal) : "—"}
          </p>
          <p className="text-xs text-neutral-500">příjmy podle faktur, náklady podle Ekonomiky</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="hidden">
          <Link href={href(year, month, "prijmy")} className={`text-sm rounded-full border px-4 py-2 ${tab === "prijmy" ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`}>
            Příjmy ({issued.length})
          </Link>
          <Link href={href(year, month, "naklady")} className={`text-sm rounded-full border px-4 py-2 ${tab === "naklady" ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`}>
            Náklady ({costs.length})
          </Link>
        </div>
        <a href={`${BASE}/zip?mesic=${ym}&typ=vse`} className="text-sm font-medium text-white bg-begina-primary-900 rounded-lg px-4 py-2">
          Stáhnout vše (ZIP)
        </a>
      </div>

      {tab === "prijmy" ? (
        <div>
          {!read.ok && (
            <p className="text-sm text-red-700 mb-2">
              {read.error.includes("402")
                ? "iDoklad odmítá přístup (kód 402 — nejspíš nezaplacené nebo vypršelé předplatné s API). Zkontroluj předplatné v iDokladu — dokud nepůjde, e-shop nevystaví faktury automaticky."
                : `Faktury z iDokladu se nepodařilo načíst: ${read.error}`}
            </p>
          )}
          {issuedTruncated && <p className="text-sm text-amber-700 mb-2">Zobrazeno prvních 100 faktur.</p>}
          {read.ok && issued.length === 0 && <p className="text-sm text-neutral-600">V tomto měsíci není vystavená žádná faktura.</p>}
          <ul className="flex flex-col gap-1.5">
            {issued.map((inv) => {
              const order = orderByNumber.get(inv.number);
              const orgId = inv.partner.ico ? orgByIco.get(inv.partner.ico) : undefined;
              return (
                <li key={inv.id} className="bg-white border border-neutral-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-sm text-begina-primary-900 break-words">
                      <b>{inv.number}</b>
                      <span className="ml-1.5 text-[11px] text-neutral-500 border border-neutral-200 rounded px-1">{/^9\d{6}$/.test(inv.number) ? "e-shop" : "ruční"}</span>
                      {" · "}
                      {orgId ? (
                        <Link href={`/rizeni-firmy/obchod/zakaznici/${orgId}`} className="underline">{inv.partner.name ?? "—"}</Link>
                      ) : (
                        inv.partner.name ?? "—"
                      )}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {inv.dateOfIssue ? formatCzDate(inv.dateOfIssue) : "—"} · {inv.payment === "paid" ? "zaplaceno" : inv.payment === "partially_paid" ? "částečně zaplaceno" : inv.payment === "overpaid" ? "přeplaceno" : "nezaplaceno"}
                      {order && (
                        <>
                          {" · "}
                          <Link href={`/rizeni-firmy/objednavky/${order.orderId}`} className="underline">objednávka {order.orderNumber}</Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-begina-primary-900 whitespace-nowrap">{inv.totalKc !== null ? kc(inv.totalKc) : "—"}</span>
                  <a href={idokladInvoicePdfPath(inv.id)} target="_blank" rel="noreferrer" className="text-xs font-medium rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1.5">
                    PDF ⬇
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
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
