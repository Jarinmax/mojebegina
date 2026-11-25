import Link from "next/link";
import { listGoodsReceipts, listStockBalances } from "@/lib/data/sklad";

const STATUS_LABELS: Record<string, string> = {
  draft: "návrh",
  confirmed: "potvrzeno",
  voided: "stornováno",
};

export default async function SkladPage() {
  const [receipts, balances] = await Promise.all([listGoodsReceipts(), listStockBalances()]);

  return (
    <div>

      <div className="mt-3 mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">Sklad surovin a obalů</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Stav skladu a příjemky (příjmy zapisuje asistent ve vlákně „Příjem surovin a obalů“).</p>
        </div>
        <Link
          href="/rizeni-firmy/sklad/nova-prijemka"
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 whitespace-nowrap"
        >
          + Nová příjemka
        </Link>
      </div>

      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Stav skladu</h2>
      {balances.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600 mb-6">Sklad je zatím prázdný.</div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl mb-6 divide-y divide-neutral-100">
          {balances.map((b) => (
            <div key={b.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-begina-primary-900">{b.name}</span>
              <span className="text-neutral-700 tabular-nums">
                {b.quantity.toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} {b.unit}
                {b.lastReceipt ? <span className="text-xs text-neutral-400 ml-2">příjem {new Date(b.lastReceipt).toLocaleDateString("cs-CZ")}</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Příjemky</h2>
      {receipts.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Zatím žádná příjemka.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {receipts.map((receipt) => (
            <Link
              key={receipt.id}
              href={`/rizeni-firmy/sklad/prijemky/${receipt.id}`}
              className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between hover:border-begina-primary-300"
            >
              <div>
                <p className="text-sm font-medium text-begina-primary-900">{receipt.supplierNameSnapshot}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {receipt.documentNumber ? `Doklad č. ${receipt.documentNumber} · ` : ""}
                  {STATUS_LABELS[receipt.status] ?? receipt.status}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
