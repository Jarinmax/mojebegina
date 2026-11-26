import Link from "next/link";
import { getAuthContext } from "@/lib/data/authContext";
import { canManagePos, POS_MANAGE_DENIED } from "@/lib/pokladna/posAuth";
import { DEFAULT_CATEGORIES, formatKc } from "@/lib/pokladna/pos";
import { listItems, NO_POS_TABLES, posTablesExist } from "@/lib/pokladna/posServer";
import { toggleItemAction } from "../actions";
import ItemForm from "./ItemForm";

// Menu pokladny — ceny se mění tady na jednom místě (jen Jarin a Lucie).
export const dynamic = "force-dynamic";

export default async function PosMenuPage() {
  const ctx = await getAuthContext();
  if (!canManagePos(ctx)) return <p className="text-sm text-red-700">{POS_MANAGE_DENIED}</p>;
  if (!(await posTablesExist())) return <p className="text-sm text-neutral-700">{NO_POS_TABLES}</p>;
  const items = await listItems(false);
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...items.map((i) => i.category)])];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mt-1 mb-3">
        <h1 className="text-lg font-medium text-begina-primary-900">Menu pokladny</h1>
        <Link href="/rizeni-firmy/pokladna" className="text-sm text-begina-primary-900 underline">← Pokladna</Link>
      </div>

      <section className="bg-white border border-neutral-200 rounded-xl p-3 mb-4">
        <h2 className="text-sm font-medium text-neutral-700 mb-2">Přidat položku</h2>
        <ItemForm categories={categories} />
      </section>

      {categories
        .filter((c) => items.some((i) => i.category === c))
        .map((c) => (
          <section key={c} className="mb-4">
            <h2 className="text-sm font-medium text-neutral-700 mb-2">{c}</h2>
            <div className="flex flex-col gap-2">
              {items
                .filter((i) => i.category === c)
                .map((i) => (
                  <div key={i.id} className={`bg-white border border-neutral-200 rounded-xl p-3 ${i.active ? "" : "opacity-60"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-begina-primary-900">
                        {i.name} · {formatKc(i.priceHal)} {!i.active && <span className="text-xs text-neutral-500">(skryto)</span>}
                      </p>
                      <form action={toggleItemAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="active" value={i.active ? "off" : "on"} />
                        <button className="text-xs underline text-neutral-600">{i.active ? "Skrýt z pokladny" : "Vrátit do pokladny"}</button>
                      </form>
                    </div>
                    <ItemForm categories={categories} item={{ id: i.id, name: i.name, category: i.category, price: String(i.priceHal / 100).replace(".", ","), sortOrder: i.sortOrder }} />
                  </div>
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}
