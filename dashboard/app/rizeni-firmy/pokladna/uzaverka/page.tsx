import Link from "next/link";
import { getAuthContext } from "@/lib/data/authContext";
import { canManagePos, canUsePos, POS_DENIED } from "@/lib/pokladna/posAuth";
import { formatKc, PAYMENT_LABELS, receiptNumber } from "@/lib/pokladna/pos";
import { daySummary, economySyncEnabled, getDayClose, listDayReceipts, listMonthCloses, NO_POS_TABLES, posTablesExist, todayPrague } from "@/lib/pokladna/posServer";
import { toggleSyncAction } from "../actions";
import CloseForm from "./CloseForm";

// Uzávěrka dne: kolik hotově / kartou / QR, kontrola hotovosti v kase.
// Po uzávěrce se (je-li zapnuto) přepíše měsíční řádek „Tržby bistro“ ve Financích.
export const dynamic = "force-dynamic";

export default async function UzaverkaPage() {
  const ctx = await getAuthContext();
  if (!canUsePos(ctx)) return <p className="text-sm text-red-700">{POS_DENIED}</p>;
  if (!(await posTablesExist())) return <p className="text-sm text-neutral-700">{NO_POS_TABLES}</p>;
  const today = todayPrague();
  const [summary, close, receipts, closes, sync] = await Promise.all([daySummary(today), getDayClose(today), listDayReceipts(today), listMonthCloses(today.slice(0, 7)), economySyncEnabled()]);
  const monthTotal = closes.reduce((s, c) => s + c.cashHal + c.cardHal + c.qrHal, 0);
  const time = (d: Date) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", timeStyle: "short" }).format(d);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mt-1 mb-3">
        <h1 className="text-lg font-medium text-begina-primary-900">Uzávěrka dne</h1>
        <Link href="/rizeni-firmy/pokladna" className="text-sm text-begina-primary-900 underline">← Pokladna</Link>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          ["Hotově", summary.cashHal],
          ["Kartou", summary.cardHal],
          ["QR platba", summary.qrHal],
          ["Celkem", summary.totalHal],
        ].map(([label, hal]) => (
          <div key={label as string} className="bg-white border border-neutral-200 rounded-xl p-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-lg font-semibold text-begina-primary-900">{formatKc(hal as number)}</p>
          </div>
        ))}
      </section>
      <p className="text-sm text-neutral-600 mb-4">
        {summary.receiptCount} účtenek{summary.cancelledCount ? `, ${summary.cancelledCount} stornovaných` : ""}.
      </p>

      {close ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm">
          Den uzavřen {time(close.closedAt)}{close.closedByName ? ` (${close.closedByName})` : ""}.
          {close.cashCountedHal !== null && (
            <> V kase {formatKc(close.cashCountedHal)} — {close.cashCountedHal === close.cashHal ? "sedí" : `rozdíl ${formatKc(close.cashCountedHal - close.cashHal)}`}.</>
          )}
        </div>
      ) : (
        <section className="bg-white border border-neutral-200 rounded-xl p-3 mb-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-2">Uzavřít dnešní den</h2>
          <CloseForm expectedCash={formatKc(summary.cashHal)} />
        </section>
      )}

      <section className="bg-white border border-neutral-200 rounded-xl p-3 mb-4 text-sm">
        <p>
          Tento měsíc uzavřeno {closes.length} dnů · <strong>{formatKc(monthTotal)}</strong>
        </p>
        <p className="mt-1 text-neutral-600">
          Zápis do Financí (řádek „Tržby bistro“): <strong>{sync ? "zapnutý" : "vypnutý — souběh se Storyous, tržby zapisuje Lucie ručně"}</strong>
        </p>
        {canManagePos(ctx) && (
          <form action={toggleSyncAction} className="mt-2">
            <input type="hidden" name="on" value={sync ? "off" : "on"} />
            <button className="rounded-full border border-neutral-200 px-4 py-1.5 text-sm">{sync ? "Vypnout zápis do Financí" : "Zapnout zápis do Financí (po přechodu ze Storyous)"}</button>
          </form>
        )}
      </section>

      <h2 className="text-sm font-medium text-neutral-700 mb-2">Dnešní účtenky</h2>
      {receipts.length === 0 ? (
        <p className="text-sm text-neutral-500">Zatím žádná.</p>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {receipts.map((r) => (
            <Link key={r.id} href={`/rizeni-firmy/pokladna/uctenka/${r.id}`} className={`flex items-center justify-between px-3 py-2 text-sm ${r.cancelled ? "text-neutral-400 line-through" : ""}`}>
              <span>
                {time(r.createdAt)} · {receiptNumber(r.year, r.seq)} · {PAYMENT_LABELS[r.paymentMethod]}
              </span>
              <span className="font-medium">{formatKc(r.totalHal)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
