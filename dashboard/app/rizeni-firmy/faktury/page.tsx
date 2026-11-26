import Link from "next/link";
import PenizeTabs from "../_penize/PenizeTabs";
import MonthPicker from "../_penize/MonthPicker";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { invoices, orders, organizations } from "@/lib/db/schema";
import { idokladInvoicePdfPath, runIdokladRead } from "@/lib/idoklad-read/tools";
import type { InvoiceSummary } from "@/lib/idoklad-read/service";
import { MONTH_NAMES } from "@/lib/ekonomika/economy";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { pragueToday } from "@/lib/data/callActivityValidation";
import { formatCzDay, formatKc, type OwnInvoiceSnapshot } from "@/lib/eshop/invoicing/ownInvoice";
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

const kc = (n: number) => `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} Kč`;
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

  const [ownRes, read, lastRes] = await Promise.all([
    db.execute(sql`
      SELECT id, number, state, version, issue_date::text AS issue_date, total_kc, customer_name, sent_at, order_id, cancel_reason, snapshot
      FROM own_invoice_documents WHERE to_char(issue_date, 'YYYY-MM') = ${ym} ORDER BY number DESC`),
    runIdokladRead("idoklad_search_invoices", { date_from: `${ym}-01`, date_to: `${ym}-${lastDay(year, month)}`, limit: 100 }, "ui"),
    db.execute(sql`SELECT max(number) AS last FROM own_invoice_documents`),
  ]);
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
  const total = activeOwn.reduce((s, r) => s + Number(r.total_kc), 0) + archive.reduce((s, i) => s + (i.totalKc ?? 0), 0);
  const count = activeOwn.length + archive.length;
  const unpaidOwn = activeOwn.filter((r) => !r.snapshot.paidDate);
  const unpaidOld = archive.filter((i) => i.payment !== "paid" && i.payment !== "overpaid");
  const unpaidTotal = unpaidOwn.reduce((s, r) => s + Number(r.total_kc), 0) + unpaidOld.reduce((s, i) => s + (i.totalKc ?? 0), 0);
  const unpaidCount = unpaidOwn.length + unpaidOld.length;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="max-w-5xl">
      <PenizeTabs active="faktury" />
      <p className="text-sm text-neutral-600 mb-3">Vydané faktury po měsících — nové z MojeBegina i starší z iDokladu v jednom seznamu. Novou ruční fakturu připraví asistent (stačí mu napsat komu a co).</p>
      <MonthPicker year={year} month={month} nowYear={nowY} nowMonth={nowM} minYear={2020} href={(y, m) => `${BASE}?rok=${y}&mesic=${m}`} />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500 capitalize">Fakturováno – {monthLabel}</p>
          <p className="text-lg font-semibold text-begina-primary-900">{kc(total)}</p>
          <p className="text-xs text-neutral-500">{count} faktur (bez stornovaných)</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Neuhrazeno</p>
          <p className={`text-lg font-semibold ${unpaidTotal > 0 ? "text-red-700" : "text-begina-primary-900"}`}>{kc(unpaidTotal)}</p>
          <p className="text-xs text-neutral-500">{unpaidCount} faktur</p>
        </div>
      </div>
      {!read.ok && <p className="text-sm text-red-700 mb-2">Starší faktury se nepodařilo načíst: {read.error}</p>}
      {archiveTruncated && <p className="text-sm text-amber-700 mb-2">Ze starších faktur je zobrazeno prvních 100.</p>}
      {items.length === 0 ? (
        <p className="text-sm text-neutral-600 bg-white border border-neutral-200 rounded-xl p-4">V tomto měsíci není vystavená žádná faktura.</p>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {items.map((it) => {
            if (it.own) {
              const r = it.own;
              const paid = r.snapshot.paidDate;
              const overdue = !paid && r.state === "issued" && r.snapshot.dueDate < today;
              return (
                <div key={it.key} className={`p-3 flex flex-wrap items-start gap-x-4 gap-y-1 ${r.state === "cancelled" ? "opacity-60" : ""}`}>
                  <div className="min-w-[7rem]">
                    <a href={ownInvoicePdfPath(r.number)} target="_blank" rel="noreferrer" className="font-medium text-begina-primary-900 underline">{r.number}</a>
                    <p className="text-xs text-neutral-500">{formatCzDay(r.issue_date)}{r.version > 1 ? ` · verze ${r.version}` : ""}</p>
                  </div>
                  <div className="flex-1 min-w-[10rem]">
                    <p className="text-sm text-neutral-900">{r.customer_name}</p>
                    <p className="text-xs text-neutral-500">{r.order_id ? "e-shop" : "ruční"} · {r.sent_at ? `odesláno ${formatCzDay(r.sent_at.slice(0, 10))}` : "neodesláno"}</p>
                  </div>
                  <div className="text-right min-w-[7rem]">
                    <p className={`text-sm font-medium ${r.state === "cancelled" ? "line-through" : ""}`}>{formatKc(Number(r.total_kc))}</p>
                    <p className={`text-xs ${r.state === "cancelled" ? "text-neutral-500" : paid ? "text-emerald-700" : overdue ? "text-red-700" : "text-amber-700"}`}>
                      {r.state === "cancelled" ? `storno${r.cancel_reason ? ` – ${r.cancel_reason}` : ""}` : paid ? `uhrazeno ${formatCzDay(paid)}` : overdue ? `po splatnosti (${formatCzDay(r.snapshot.dueDate)})` : `splatnost ${formatCzDay(r.snapshot.dueDate)}`}
                    </p>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[14rem]">
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
              <div key={it.key} className="p-3 flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="min-w-[7rem]">
                  <a href={idokladInvoicePdfPath(inv.id)} target="_blank" rel="noreferrer" className="font-medium text-begina-primary-900 underline">{inv.number}</a>
                  <p className="text-xs text-neutral-500">{inv.dateOfIssue ? formatCzDay(inv.dateOfIssue) : "—"}</p>
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-sm text-neutral-900">
                    {orgId ? <Link href={`/rizeni-firmy/obchod/zakaznici/${orgId}`} className="underline">{inv.partner.name ?? "—"}</Link> : inv.partner.name ?? "—"}
                  </p>
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
                <div className="text-right min-w-[7rem]">
                  <p className="text-sm font-medium">{inv.totalKc !== null ? kc(inv.totalKc) : "—"}</p>
                  <p className={`text-xs ${paidOld ? "text-emerald-700" : "text-amber-700"}`}>{paidOld ? "zaplaceno" : inv.payment === "partially_paid" ? "částečně zaplaceno" : "nezaplaceno"}</p>
                </div>
                <div className="w-full sm:w-auto sm:min-w-[14rem]" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
