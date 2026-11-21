import Link from "next/link";
import { formatCzDate, daysUntil } from "@/lib/vyroba/batches";
import { NO_BATCH_TABLE, batchesTableExists, expiringLines, listBatches, listBatchProducts, todayPrague } from "@/lib/vyroba/batchesServer";
import { requireOrderContext } from "@/lib/data/orders";
import BatchForm from "./BatchForm";
import { toggleSoldOutAction } from "./actions";

// Šarže (Lucie 21. 11. 2026): Jarin po uvaření zapíše šarži, systém
// dopočítá datum spotřeby, pošle upozornění na info@ a hlídá, co končí.
export const dynamic = "force-dynamic";

function expiryClass(left: number) {
  if (left < 0) return "text-red-700 font-medium";
  if (left <= 3) return "text-amber-700 font-medium";
  return "text-neutral-600";
}

export default async function SarzePage() {
  await requireOrderContext();
  const today = todayPrague();
  if (!(await batchesTableExists())) {
    return (
      <div>
        <h1 className="text-lg font-medium text-begina-primary-900 mt-1 mb-3">Šarže</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm">{NO_BATCH_TABLE}</div>
      </div>
    );
  }
  const [products, batches] = await Promise.all([listBatchProducts(), listBatches(150)]);
  const expiring = expiringLines(batches, today, 3);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mt-1 mb-3">
        <h1 className="text-lg font-medium text-begina-primary-900">Šarže</h1>
        <Link href="/rizeni-firmy/vyroba" className="text-sm text-begina-primary-900 underline">
          ← Výroba
        </Link>
      </div>

      {expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 text-sm">
          <p className="font-medium text-amber-900 mb-1">Končí datum spotřeby</p>
          <ul className="list-disc pl-5">
            {expiring.map(({ batch, line, daysLeft }) => (
              <li key={line.id}>
                {batch.productName}, {line.label}, šarže {batch.code}: {daysLeft < 0 ? `prošlo ${formatCzDate(line.bestBefore)}` : daysLeft === 0 ? "končí dnes" : `končí za ${daysLeft} d (${formatCzDate(line.bestBefore)})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="text-sm font-medium text-neutral-700 mb-2">Nová šarže</h2>
      <BatchForm products={products} today={today} />

      <h2 className="text-sm font-medium text-neutral-700 mt-6 mb-2">Zapsané šarže</h2>
      {batches.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">Zatím žádná šarže.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {batches.map((b) => (
            <div key={b.id} className="bg-white border border-neutral-200 rounded-xl p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-begina-primary-900">
                  {b.productName} <span className="font-mono text-neutral-700 ml-1">{b.code}</span>
                </p>
                <p className="text-xs text-neutral-500">
                  vyrobeno {formatCzDate(b.producedOn)}
                  {b.createdByName ? ` · ${b.createdByName}` : ""}
                </p>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {b.lines.map((l) => {
                  const left = l.bestBefore ? daysUntil(l.bestBefore, today) : null;
                  return (
                    <li key={l.id} className={`flex flex-wrap items-center gap-2 text-sm ${l.soldOut ? "opacity-50" : ""}`}>
                      <span className="w-40">{l.label}</span>
                      <span className="w-16">{l.quantity} ks</span>
                      <span className={left === null ? "text-neutral-500" : expiryClass(left)}>do {formatCzDate(l.bestBefore)}</span>
                      <form action={toggleSoldOutAction.bind(null, l.id, !l.soldOut)} className="ml-auto">
                        <button className="text-xs rounded-full border border-neutral-300 px-3 py-1">{l.soldOut ? "Vrátit" : "Vyprodáno"}</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
              {b.note && <p className="text-xs text-neutral-500 mt-1">{b.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
