import Link from "next/link";
import PenizeTabs from "../_penize/PenizeTabs";
import MonthPicker from "../_penize/MonthPicker";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { invoices, orders, organizations } from "@/lib/db/schema";
import { idokladInvoicePdfPath, runIdokladRead } from "@/lib/idoklad-read/tools";
import type { InvoiceSummary } from "@/lib/idoklad-read/service";
import { MONTH_NAMES, formatCzDate } from "@/lib/ekonomika/economy";
import { loadEconomyYear } from "@/lib/ekonomika/economyServer";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { pragueToday } from "@/lib/data/callActivityValidation";
import { formatCzDay, type OwnInvoiceSnapshot } from "@/lib/eshop/invoicing/ownInvoice";
import { ownInvoicePdfPath } from "@/lib/eshop/invoicing/ownB2b";
import InvoiceActions from "./InvoiceActions";

// FAKTURY (Lucie 23. 11. 2026) — vlastní faktury MojeBegina v jedné řadě
// 2026xxxx (e-shop i ruční). PDF, stav úhrady a odeslání, úprava / storno /
// smazání poslední neodeslané.
// 26. 11. 2026 (Lucie): jeden seznam po měsících — nové faktury MojeBegina i
// starší z archivu iDokladu dohromady, od nejnovějšího.
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  number: string;
  state: "issued" | "cancelled";
  version: number;
  issue_date: string;
  total_kc: number;
  customer_name: string;
  sent_at: string | null;
  order_id: string | null;
  cancel_reason: string | null;
  snapshot: OwnInvoiceSnapshot;
};

// Částky vždy se dvěma desetinnými místy a stejně širokými číslicemi — čárky jsou pod sebou (Lucie 26. 11. 2026).
const kc = (n: number) => `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} Kč`;
const kcHal = (hal: number) => kc(hal / 100);
const fakturWord = (n: number) => (n === 1 ? "faktura" : n >= 2 && n <= 4 ? "faktury" : "faktur");
// Jiné příjmy (Lucie 26. 11. 2026): nesouvisí s Beginou ani s bistrem — montáže, zprostředkování (podle položek faktury) a Wolt.
const WORK_RE = /montáž|zprostředkování|elektro|klimatiz|servis|revize/i;
const OTHER_ENTRY_RE = /wolt/i;
// Doprava na faktuře (Lucie 28. 11. 2026: příjmy Beginy i po odečtení dopravy) — „Chlazená přeprava“, „Doprava“, „Poštovné“, „Rozvoz…“.
const SHIPPING_RE = /^\s*(doprava|chlazen[áý] (doprava|přeprava)|poštovné|rozvoz)/i;
const SHIPPING_SQL = "^\\s*(doprava|chlazen[áý] (doprava|přeprava)|poštovné|rozvoz)";
const lastDay = (year: number, month: number) => String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
const BASE = "/rizeni-firmy/faktury";

export default async function FakturyPage(props: PageProps<"/rizeni-firmy/faktury">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const sp = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const today = pragueToday(new Date());
  const nowY = Number(today.slice(0, 4));
  const nowM = Number(today.slice(5, 7));
  const year = Math.min(Math.max(Number(first(sp.rok)) || nowY, 2020), nowY);
  const maxM = year === nowY ? nowM : 12;
  const month = Math.min(Math.max(Number(first(sp.mesic)) || maxM, 1), maxM);
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  const [ownRes, read, lastRes, economy] = await Promise.all([
    db.execute(sql`
      SELECT id, number, state, version, issue_date::text AS issue_date, total_kc, customer_name, sent_at, order_id, cancel_reason, snapshot
      FROM own_invoice_documents WHERE to_char(issue_date, 'YYYY-MM') = ${ym} ORDER BY number DESC`),
    runIdokladRead("idoklad_search_invoices", { date_from: `${ym}-01`, date_to: `${ym}-${lastDay(year, month)}`, limit: 100 }, "ui"),
    db.execute(sql`SELECT max(number) AS last FROM own_invoice_documents`),
    loadEconomyYear(year),
  ]);
  // Příjmy bez faktury (Lucie 26. 11. 2026): tržby bistra, Wolt, prodejní doklady — z Ekonomiky.
  const monthIncome = economy.filter((r) => r.kind === "income" && r.entryDate.slice(0, 7) === ym);
  const incomeTotalHal = monthIncome.reduce((sum, r) => sum + r.amountHal, 0);
  const noInvoice = monthIncome.filter((r) => !r.invoiceNumber).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  const own = ownRes.rows as Row[];
  const last = (lastRes.rows[0] as { last: string | null } | undefined)?.last ?? null;
  const ownNumbers = new Set(own.map((r) => r.number));
  const archive: InvoiceSummary[] = read.ok ? ((read.data.invoices as InvoiceSummary[]) ?? []).filter((i) => !ownNumbers.has(i.number)) : [];
  const archiveTruncated = read.ok && read.data.truncated === true;

  // propojení starších faktur s objednávkami a kartami klientů
  const numbers = archive.map((i) => i.number).filter(Boolean);
  const icos = [...new Set(archive.map((i) => i.partner.ico).filter((v): v is string => Boolean(v)))];
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

  type Item = { key: string; date: string; number: string; own?: Row; old?: InvoiceSummary };
  const items: Item[] = [
    ...own.map((r) => ({ key: r.id, date: r.issue_date, number: r.number, own: r })),
    ...archive.map((i) => ({ key: `old-${i.id}`, date: i.dateOfIssue ?? "", number: i.number, old: i })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  const activeOwn = own.filter((r) => r.state === "issued");
  const unpaidOwn = activeOwn.filter((r) => !r.snapshot.paidDate);
  const unpaidOld = archive.filter((i) => i.payment !== "paid" && i.payment !== "overpaid");
  const unpaidTotal = unpaidOwn.reduce((s, r) => s + Number(r.total_kc), 0) + unpaidOld.reduce((s, i) => s + (i.totalKc ?? 0), 0);
  const unpaidCount = unpaidOwn.length + unpaidOld.length;
  // položky starších faktur (kvůli rozdělení na Beginu a montáže)
  const archiveLines = new Map<string, string>();
  const archiveShipping = new Map<string, number>();
  if (archive.length) {
    const res = await db.execute(sql`
      SELECT number, coalesce((SELECT string_agg(i->>'Name', ' | ') FROM jsonb_array_elements(raw->'Items') i), '') AS lines,
             coalesce((SELECT sum((i->'Prices'->>'TotalWithVat')::numeric) FROM jsonb_array_elements(raw->'Items') i WHERE i->>'Name' ~* ${SHIPPING_SQL}), 0) AS shipping
      FROM idoklad_archive WHERE number IN (${sql.join(archive.map((i) => sql`${i.number}`), sql`, `)})`);
    for (const row of res.rows as { number: string; lines: string; shipping: string | number }[]) {
      archiveLines.set(row.number, row.lines);
      archiveShipping.set(row.number, Number(row.shipping) || 0);
    }
  }
  const linesOf = (it: Item) => (it.own ? it.own.snapshot.lines.map((l) => l.name).join(" | ") : archiveLines.get(it.number) ?? "");
  const isWork = (it: Item) => WORK_RE.test(linesOf(it));
  const work = items.filter(isWork);
  const beginaInvoices = items.filter((it) => !isWork(it));
  const bistro = noInvoice.filter((r) => /bistro/i.test(r.title));
  const otherEntries = noInvoice.filter((r) => !/bistro/i.test(r.title) && OTHER_ENTRY_RE.test(`${r.title} ${r.counterparty ?? ""}`));
  const beginaOther = noInvoice.filter((r) => !/bistro/i.test(r.title) && !otherEntries.includes(r));
  const itemKc = (it: Item) => (it.own ? (it.own.state === "issued" ? Number(it.own.total_kc) : 0) : it.old!.totalKc ?? 0);
  const beginaKc = beginaInvoices.reduce((sum, it) => sum + itemKc(it), 0) + beginaOther.reduce((sum, r) => sum + r.amountHal, 0) / 100;
  const shippingOf = (it: Item) =>
    it.own
      ? it.own.state === "issued"
        ? it.own.snapshot.lines.filter((l) => SHIPPING_RE.test(l.name)).reduce((sum, l) => sum + Number(l.totalKc), 0)
        : 0
      : archiveShipping.get(it.number) ?? 0;
  const beginaShippingKc = beginaInvoices.reduce((sum, it) => sum + shippingOf(it), 0);
  const shippingNote = beginaShippingKc > 0 ? `bez dopravy ${kc(beginaKc - beginaShippingKc)} · doprava ${kc(beginaShippingKc)}` : null;
  const workKc = work.reduce((sum, it) => sum + itemKc(it), 0) + otherEntries.reduce((sum, r) => sum + r.amountHal, 0) / 100;
  const hasOther = work.length > 0 || otherEntries.length > 0;
  // Bistro jen tam, kde jsou tržby — nebo v aktuálním/minulém měsíci, kdy se tržby teprve zapíšou (Lucie 26. 11. 2026: v lednu bistro ještě nebylo).
  const prevYm = nowM === 1 ? `${nowY - 1}-12` : `${nowY}-${String(nowM - 1).padStart(2, "0")}`;
  const showBistro = bistro.length > 0 || ym === today.slice(0, 7) || ym === prevYm;
  const bistroKc = bistro.reduce((sum, r) => sum + r.amountHal, 0) / 100;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const row = "grid grid-cols-[6.5rem_1fr] sm:grid-cols-[6.5rem_1fr_10rem_9rem] items-start gap-x-4 gap-y-1 p-3";
  const amount = "text-sm font-medium text-right tabular-nums whitespace-nowrap";

  const invoiceRow = (it: Item) => {
    if (it.own) {
      const r = it.own;
      const paid = r.snapshot.paidDate;
      const overdue = !paid && r.state === "issued" && r.snapshot.dueDate < today;
      return (
        <div key={it.key} className={`${row} ${r.state === "cancelled" ? "opacity-60" : ""}`}>
          <div>
            <a href={ownInvoicePdfPath(r.number)} target="_blank" rel="noreferrer" className="font-medium text-begina-primary-900 underline">{r.number}</a>
            <p className="text-xs text-neutral-500">{formatCzDay(r.issue_date)}{r.version > 1 ? ` · verze ${r.version}` : ""}</p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-neutral-900 break-words">{r.customer_name}</p>
            {isWork(it) && <p className="text-xs font-medium text-sky-800 break-words">{linesOf(it).split(" | ").filter((l) => !/zaokrouhlení/i.test(l)).join(" · ")}</p>}
            <p className="text-xs text-neutral-500">{r.order_id ? "e-shop" : "ruční"} · {r.sent_at ? `odesláno ${formatCzDay(r.sent_at.slice(0, 10))}` : "neodesláno"}</p>
          </div>
          <div className="col-start-2 sm:col-start-auto">
            <p className={`${amount} ${r.state === "cancelled" ? "line-through" : ""}`}>{kc(Number(r.total_kc))}</p>
            <p className={`text-xs text-right ${r.state === "cancelled" ? "text-neutral-500" : paid ? "text-emerald-700" : overdue ? "text-red-700" : "text-amber-700"}`}>
              {r.state === "cancelled" ? `storno${r.cancel_reason ? ` – ${r.cancel_reason}` : ""}` : paid ? `uhrazeno ${formatCzDay(paid)}` : overdue ? `po splatnosti (${formatCzDay(r.snapshot.dueDate)})` : `splatnost ${formatCzDay(r.snapshot.dueDate)}`}
            </p>
          </div>
          <div className="col-start-2 sm:col-start-auto">
            <InvoiceActions number={r.number} paid={Boolean(paid)} cancelled={r.state === "cancelled"} canDelete={r.number === last && !r.sent_at} today={today} />
          </div>
        </div>
      );
    }
    const inv = it.old!;
    const order = orderByNumber.get(inv.number);
    const orgId = inv.partner.ico ? orgByIco.get(inv.partner.ico) : undefined;
    const paidOld = inv.payment === "paid" || inv.payment === "overpaid";
    return (
      <div key={it.key} className={row}>
        <div>
          <a href={idokladInvoicePdfPath(inv.id)} target="_blank" rel="noreferrer" className="font-medium text-begina-primary-900 underline">{inv.number}</a>
          <p className="text-xs text-neutral-500">{inv.dateOfIssue ? formatCzDay(inv.dateOfIssue) : "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-neutral-900 break-words">
            {orgId ? <Link href={`/rizeni-firmy/obchod/zakaznici/${orgId}`} className="underline">{inv.partner.name ?? "—"}</Link> : inv.partner.name ?? "—"}
          </p>
          {isWork(it) && <p className="text-xs font-medium text-sky-800 break-words">{linesOf(it).split(" | ").filter((l) => !/zaokrouhlení/i.test(l)).join(" · ")}</p>}
          <p className="text-xs text-neutral-500">
            {/^9\d{6}$/.test(inv.number) ? "e-shop" : "ruční"} · starší (iDoklad)
            {order && (
              <>
                {" · "}
                <Link href={`/rizeni-firmy/objednavky/${order.orderId}`} className="underline">objednávka {order.orderNumber}</Link>
              </>
            )}
          </p>
        </div>
        <div className="col-start-2 sm:col-start-auto">
          <p className={amount}>{inv.totalKc !== null ? kc(inv.totalKc) : "—"}</p>
          <p className={`text-xs text-right ${paidOld ? "text-emerald-700" : "text-amber-700"}`}>{paidOld ? "zaplaceno" : inv.payment === "partially_paid" ? "částečně zaplaceno" : "nezaplaceno"}</p>
        </div>
        <div className="hidden sm:block" />
      </div>
    );
  };
  const entryRow = (r: (typeof noInvoice)[number]) => (
    <div key={r.id} className={row}>
      <div className="text-xs text-neutral-500 pt-0.5">{formatCzDate(r.entryDate)}</div>
      <div className="min-w-0">
        <p className="text-sm text-neutral-900 break-words">
          {/bistro/i.test(r.title) ? "Tržby Zahradního bistra" : OTHER_ENTRY_RE.test(`${r.title} ${r.counterparty ?? ""}`) ? r.counterparty ?? r.title : `${r.title}${r.counterparty ? ` · ${r.counterparty}` : ""}`}
        </p>
        {OTHER_ENTRY_RE.test(`${r.title} ${r.counterparty ?? ""}`) && <p className="text-xs font-medium text-sky-800">výplata tržeb z Woltu</p>}
        {(r.paymentForm || r.note) && <p className="text-xs text-neutral-500 break-words">{[r.paymentForm, r.note].filter(Boolean).join(" · ")}</p>}
      </div>
      <p className={`${amount} col-start-2 sm:col-start-auto`}>{kcHal(r.amountHal)}</p>
      <div className="hidden sm:block" />
    </div>
  );
  const group = (key: string, title: string, sub: string, tone: string, total: number, rows: React.ReactNode[], empty: string, note?: string | null) => (
    <section key={key} className={`mb-4 bg-white border border-neutral-200 border-l-8 ${tone} rounded-xl overflow-hidden`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-3 border-b border-neutral-100">
        <div>
          <h2 className="text-base font-semibold text-begina-primary-900">{title}</h2>
          <p className="text-xs text-neutral-500">{sub}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-begina-primary-900 tabular-nums">{kc(total)}</p>
          {note && <p className="text-xs text-neutral-500 tabular-nums">{note}</p>}
        </div>
      </header>
      {rows.length === 0 ? <p className="text-sm text-neutral-500 p-3">{empty}</p> : <div className="divide-y divide-neutral-100">{rows}</div>}
    </section>
  );

  return (
    <div className="max-w-5xl">
      <PenizeTabs active="faktury" />
      <p className="text-sm text-neutral-600 mb-3">Všechny příjmy po měsících, rozdělené na Beginu a bistro (a jiné příjmy, když v měsíci nějaké jsou). Novou ruční fakturu připraví asistent (stačí mu napsat komu a co).</p>
      <MonthPicker year={year} month={month} nowYear={nowY} nowMonth={nowM} minYear={2020} href={(y, m) => `${BASE}?rok=${y}&mesic=${m}`} />
      <div className={`grid grid-cols-2 ${["sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"][Number(hasOther) + Number(showBistro)]} gap-2 mb-4`}>
        <div className="col-span-2 sm:col-span-1 bg-begina-primary-900 text-white rounded-xl p-3">
          <p className="text-xs opacity-80">Příjmy celkem – {monthLabel}</p>
          <p className="text-lg font-semibold tabular-nums">{kcHal(incomeTotalHal)}</p>
          <p className="text-xs opacity-80">jako v Přehledu</p>
        </div>
        {(
          [
            ["Begina", beginaKc, "border-l-emerald-600"],
            // Jiné příjmy jen v měsíci, kdy nějaké jsou (Lucie 26. 11. 2026).
            ...(hasOther ? [["Jiné příjmy", workKc, "border-l-sky-500"]] : []),
            ...(showBistro ? [["Bistro", bistroKc, "border-l-amber-500"]] : []),
          ] as [string, number, string][]
        ).map(([label, value, tone]) => (
          <div key={label} className={`bg-white border border-neutral-200 border-l-8 ${tone} rounded-xl p-3`}>
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-lg font-semibold text-begina-primary-900 tabular-nums">{kc(value)}</p>
            {label === "Begina" && beginaShippingKc > 0 && (
              <p className="text-xs text-neutral-500 tabular-nums">
                bez dopravy {kc(beginaKc - beginaShippingKc)}
                <br />
                doprava {kc(beginaShippingKc)}
              </p>
            )}
          </div>
        ))}
      </div>
      {unpaidCount > 0 && (
        <p className="mb-3 rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-sm font-medium text-red-800">Neuhrazeno: {unpaidCount} {unpaidCount === 1 ? "faktura" : unpaidCount <= 4 ? "faktury" : "faktur"} za {kc(unpaidTotal)}</p>
      )}
      {!read.ok && <p className="text-sm text-red-700 mb-2">Starší faktury se nepodařilo načíst: {read.error}</p>}
      {archiveTruncated && <p className="text-sm text-amber-700 mb-2">Ze starších faktur je zobrazeno prvních 100.</p>}
      {group("begina", "Begina – nápoje a polévky", `${beginaInvoices.length} ${fakturWord(beginaInvoices.length)}${beginaOther.length ? ` + ${beginaOther.length} bez faktury` : ""}`, "border-l-emerald-600", beginaKc, [...beginaInvoices.map(invoiceRow), ...beginaOther.map(entryRow)], "V tomto měsíci nic.", shippingNote)}
      {hasOther && group("jine", "Jiné příjmy", "nesouvisí s Beginou ani s bistrem", "border-l-sky-500", workKc, [...work.map(invoiceRow), ...otherEntries.map(entryRow)], "")}
      {showBistro && group("bistro", "Zahradní bistro Begina", "tržby za celý měsíc (hotově, QR, kartou)", "border-l-amber-500", bistroKc, bistro.map(entryRow), "Zatím nezapsáno — tržby bistra se zapisují za celý měsíc, vždy začátkem dalšího měsíce.")}
      <p className="text-xs text-neutral-500">Součet skupin se může od „Příjmy celkem“ lišit o poplatky za platby kartou — Přehled počítá skutečně přijaté peníze.</p>
    </div>
  );
}
