import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { LOG_ACTION_LABELS, findCheck } from "@/lib/finance-kontroly/checks";
import { financeLogTableExists, loadJournal } from "@/lib/finance-kontroly/server";
import { BASE, formatPragueDateTime, pragueToday } from "../shared";

// FINANCE – KONTROLY A AUDIT 1.0 — auditní deník: všechny zápisy ze všech
// složek kontrol, nejnovější první. Jen pro čtení — zápisy se nemažou.
export const dynamic = "force-dynamic";

const JOURNAL_LIMIT = 300;

export default async function FinanceJournalPage() {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const { year } = pragueToday();
  const logReady = await financeLogTableExists();
  const entries = logReady ? await loadJournal(JOURNAL_LIMIT) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div>
        <p className="text-sm">
          <Link href={BASE} className="text-begina-primary-900 underline">
            Finance – kontroly a audit
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Auditní deník</h1>
        <p className="mt-1 text-sm text-neutral-600">Všechny zápisy ze všech kontrol. Zápisy se nemažou ani neupravují — oprava omylu je nový zápis.</p>
      </div>

      {!logReady ? (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Deník kontrol v databázi ještě není (skript 123_finance_kontroly_MAIN).</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-neutral-600">Zatím žádný zápis.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-3 py-2 font-medium">Kdy</th>
                <th className="px-3 py-2 font-medium">Kdo</th>
                <th className="px-3 py-2 font-medium">Kontrola</th>
                <th className="px-3 py-2 font-medium">Zápis</th>
                <th className="px-3 py-2 font-medium">Poznámka</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const check = findCheck(entry.checkKey);
                return (
                  <tr key={entry.id} className="border-b border-neutral-100 last:border-0 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatPragueDateTime(entry.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{entry.authorName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {check ? (
                        <Link href={`${BASE}/${check.key}?rok=${year}`} className="text-begina-primary-900 underline">
                          {check.title}
                        </Link>
                      ) : (
                        entry.checkKey
                      )}
                    </td>
                    <td className="px-3 py-2">{LOG_ACTION_LABELS[entry.action]}</td>
                    <td className="px-3 py-2 text-neutral-600">{entry.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === JOURNAL_LIMIT && <p className="text-xs text-neutral-500">Zobrazeno posledních {JOURNAL_LIMIT} zápisů.</p>}
    </div>
  );
}
