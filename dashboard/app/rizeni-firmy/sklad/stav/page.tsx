import Link from "next/link";
import { listStock } from "@/lib/data/skladFinishedGoods";

const KIND_LABELS: Record<string, string> = {
  stock_material: "Surovina",
  resale_goods: "Zboží k prodeji",
  operating_supply: "Provozní spotřeba",
  finished_good: "Hotový výrobek",
};

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

// Sklad 1.1 — fyzický / rezervovaný / volný stav (zadání, bod 5). Rezervace
// a výdej zatím jen přes MCP (ChatGPT) — tahle stránka je čtecí přehled.
export default async function SkladStavPage() {
  const rows = await listStock();

  return (
    <div>
      <Link href="/rizeni-firmy/sklad" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Sklad
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Stav skladu</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Fyzický stav, rezervováno a volný stav podle karty a lokace.</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Zatím žádný skladový pohyb.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={`${row.stockItemId}:${row.stockLocationId}`} className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-begina-primary-900">{row.stockItemName}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {KIND_LABELS[row.stockItemKind] ?? row.stockItemKind} · {row.stockLocationName}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div>
                  <p className="text-xs text-neutral-500">Fyzický stav</p>
                  <p className="text-sm font-medium text-begina-primary-900">
                    {formatQty(row.physicalQuantity)} {row.canonicalUnit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Rezervováno</p>
                  <p className="text-sm font-medium text-begina-primary-900">
                    {formatQty(row.reservedQuantity)} {row.canonicalUnit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Volný stav</p>
                  <p className="text-sm font-medium text-begina-primary-900">
                    {formatQty(row.freeQuantity)} {row.canonicalUnit}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
