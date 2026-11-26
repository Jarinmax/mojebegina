import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireOrderContext } from "@/lib/data/orders";
import { listTrackedStock } from "@/lib/eshop/variantStock";
import { formatCzDate, daysUntil } from "@/lib/vyroba/batches";
import { batchesTableExists, listBatches, todayPrague } from "@/lib/vyroba/batchesServer";
import { lineRecipients } from "@/lib/vyroba/batchAllocation";
import AdjustForm from "./AdjustForm";

// Sklad hotových výrobků (Lucie 26. 11. 2026): na jednom místě kapsičky 650 ml
// s hlídaným počtem kusů (e-shop a ruční objednávky je odečítají samy, tady se
// odepisují vzorky a prodej v bistru) a přehled šarží — kolik zbývá a do kdy.
export const dynamic = "force-dynamic";

export default async function SkladHotovychPage() {
  await requireOrderContext();
  const today = todayPrague();
  const tracked = await listTrackedStock(db).catch(() => []);
  const hasBatches = await batchesTableExists();
  const batches = hasBatches ? await listBatches(150) : [];
  const recipients = hasBatches
    ? await lineRecipients(batches.flatMap((b) => b.lines.map((l) => l.id))).catch(() => new Map())
    : new Map();
  const rows = batches.flatMap((b) =>
    b.lines
      .filter((l) => !l.soldOut)
      .map((l) => {
        const sent = (recipients.get(l.id) ?? []) as Array<{ quantity: number }>;
        const used = sent.reduce((n, r) => n + r.quantity, 0);
        return { key: l.id, product: b.productName, code: b.code, label: l.label, made: l.quantity, left: Math.max(0, l.quantity - used), bestBefore: l.bestBefore };
      })
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mt-1 mb-3">
        <h1 className="text-lg font-medium text-begina-primary-900">Sklad hotových výrobků</h1>
        <Link href="/rizeni-firmy/vyroba/sarze" className="text-sm text-begina-primary-900 underline">
          Šarže →
        </Link>
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-1">Kapsičky 650 ml na e-shopu (doprodej)</h2>
      <p className="text-xs text-neutral-500 mb-2">
        Objednávky z e-shopu a ruční objednávky kusy odečítají samy, storno je vrací. Vzorek nebo prodej v bistru odepište tady.
      </p>
      {tracked.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">Žádné balení nemá hlídaný počet kusů.</div>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {tracked.map((t) => (
            <div key={t.sku} className="bg-white border border-neutral-200 rounded-xl p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-begina-primary-900">
                  {t.product} {t.label}
                </p>
                <p className={`text-sm font-semibold ${t.stockQty <= 0 ? "text-red-700" : t.stockQty <= 3 ? "text-amber-700" : "text-begina-primary-900"}`}>
                  {t.stockQty <= 0 ? "Vyprodáno" : `${t.stockQty} ks`}
                </p>
              </div>
              <AdjustForm sku={t.sku} />
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-medium text-neutral-700 mb-2">Šarže skladem</h2>
      {rows.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">Žádná šarže skladem.</div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2">Výrobek</th>
                <th className="text-left px-3 py-2">Balení</th>
                <th className="text-right px-3 py-2">Skladem</th>
                <th className="text-left px-3 py-2">Spotřebujte do</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const left = r.bestBefore ? daysUntil(r.bestBefore, today) : null;
                return (
                  <tr key={r.key} className="border-t border-neutral-100">
                    <td className="px-3 py-2">
                      {r.product} <span className="font-mono text-xs text-neutral-500">{r.code}</span>
                    </td>
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-right">
                      {r.left} <span className="text-xs text-neutral-500">z {r.made}</span>
                    </td>
                    <td className={`px-3 py-2 ${left !== null && left < 0 ? "text-red-700 font-medium" : left !== null && left <= 3 ? "text-amber-700 font-medium" : ""}`}>
                      {formatCzDate(r.bestBefore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
