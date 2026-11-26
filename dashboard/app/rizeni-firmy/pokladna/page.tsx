import Link from "next/link";
import { getAuthContext } from "@/lib/data/authContext";
import { canManagePos, canUsePos, POS_DENIED } from "@/lib/pokladna/posAuth";
import { DEFAULT_CATEGORIES, formatKc } from "@/lib/pokladna/pos";
import { daySummary, listItems, NO_POS_TABLES, posTablesExist, todayPrague } from "@/lib/pokladna/posServer";
import PosTerminal from "./PosTerminal";

// Pokladna Zahradního Bistra Begina (Lucie 26. 11. 2026) — prodej z menu na
// tabletu/mobilu. Hotově, kartou (samostatný terminál) nebo QR platbou.
export const dynamic = "force-dynamic";

export default async function PokladnaPage() {
  const ctx = await getAuthContext();
  if (!canUsePos(ctx)) return <p className="text-sm text-red-700">{POS_DENIED}</p>;
  if (!(await posTablesExist())) return <p className="text-sm text-neutral-700">{NO_POS_TABLES}</p>;
  const items = await listItems(true);
  const summary = await daySummary(todayPrague());
  const categories = [...DEFAULT_CATEGORIES.filter((c) => items.some((i) => i.category === c)), ...[...new Set(items.map((i) => i.category))].filter((c) => !DEFAULT_CATEGORIES.includes(c))];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-1 mb-3">
        <h1 className="text-lg font-medium text-begina-primary-900">Pokladna bistra</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600">
            Dnes {summary.receiptCount} účtenek · <strong>{formatKc(summary.totalHal)}</strong>
          </span>
          <Link href="/rizeni-firmy/pokladna/uzaverka" className="text-begina-primary-900 underline">Uzávěrka</Link>
          {canManagePos(ctx) && <Link href="/rizeni-firmy/pokladna/menu" className="text-begina-primary-900 underline">Menu</Link>}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-700">
          Menu je prázdné. {canManagePos(ctx) ? <Link href="/rizeni-firmy/pokladna/menu" className="underline">Přidat položky →</Link> : "Položky přidá Lucie nebo Jarin."}
        </div>
      ) : (
        <PosTerminal items={items.map((i) => ({ id: i.id, category: i.category, name: i.name, priceHal: i.priceHal }))} categories={categories} />
      )}
    </div>
  );
}
