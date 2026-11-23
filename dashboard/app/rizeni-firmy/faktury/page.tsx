import Link from "next/link";
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
// smazání poslední neodeslané. Starší faktury do 20260214 jsou v iDokladu.
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

export default async function FakturyPage(props: PageProps<"/rizeni-firmy/faktury">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const sp = await props.searchParams;
  const today = pragueToday(new Date());
  const nowY = Number(today.slice(0, 4));
  const year = Math.min(Math.max(Number(Array.isArray(sp.rok) ? sp.rok[0] : sp.rok) || nowY, 2026), nowY);
  const rows = (
    await db.execute(sql`
      SELECT id, number, state, version, issue_date::text AS issue_date, total_kc, customer_name, sent_at, order_id, cancel_reason, snapshot
      FROM own_invoice_documents WHERE left(number, 4) = ${String(year)} ORDER BY number DESC`)
  ).rows as Row[];
  const last = rows[0]?.number ?? null;
  const active = rows.filter((r) => r.state === "issued");
  const total = active.reduce((s, r) => s + Number(r.total_kc), 0);
  const unpaid = active.filter((r) => !r.snapshot.paidDate);
  const unpaidTotal = unpaid.reduce((s, r) => s + Number(r.total_kc), 0);

  return (
    <div className="max-w-5xl">
      <Link href="/rizeni-firmy" className="text-sm text-begina-primary-700">← Řízení firmy</Link>
      <h1 className="text-lg font-medium text-begina-primary-900 mt-1">Faktury</h1>
      <p className="text-sm text-neutral-600 mb-3">
        Všechny faktury vystavuje MojeBegina v řadě {year}xxxx. Nové ruční faktury připraví asistent (stačí mu napsat komu a co). Starší faktury do 20260214 zůstávají v iDokladu.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {Array.from({ length: nowY - 2025 }, (_, i) => 2026 + i).map((y) => (
          <Link key={y} href={`/rizeni-firmy/faktury?rok=${y}`} className={`text-sm rounded-full border px-4 py-2 ${y === year ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`}>{y}</Link>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Vystaveno {year}</p>
          <p className="text-lg font-semibold text-begina-primary-900">{formatKc(total)}</p>
          <p className="text-xs text-neutral-500">{active.length} faktur (bez stornovaných)</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Neuhrazeno</p>
          <p className={`text-lg font-semibold ${unpaidTotal > 0 ? "text-red-700" : "text-begina-primary-900"}`}>{formatKc(unpaidTotal)}</p>
          <p className="text-xs text-neutral-500">{unpaid.length} faktur</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600 bg-white border border-neutral-200 rounded-xl p-4">Zatím žádná faktura.</p>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {rows.map((r) => {
            const paid = r.snapshot.paidDate;
            const overdue = !paid && r.state === "issued" && r.snapshot.dueDate < today;
            return (
              <div key={r.id} className={`p-3 flex flex-wrap items-start gap-x-4 gap-y-1 ${r.state === "cancelled" ? "opacity-60" : ""}`}>
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
          })}
        </div>
      )}
    </div>
  );
}
