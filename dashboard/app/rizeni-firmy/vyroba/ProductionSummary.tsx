import Link from "next/link";
import { PRODUCTION_GROUPS, type ProductionOrder } from "@/lib/data/productionBoard";
import { formatOrderNumber } from "@/lib/data/orderBuyer";
import { formatDeadlineShort } from "@/lib/czWorkdays";
import { GROUP_STYLE } from "./productionColors";

// Souhrnná výrobní tabulka (Lucie 18. 11. 2026) — jako „Objednávky výroba
// Jarda“: sloupce = zaplacení klienti, řádky = objednané produkty po
// skupinách, vpravo Celkem. Na mobilu seznam po produktech (nic neujíždí).

type Row = { name: string; group: string; cells: Map<string, { qty: number; done: boolean }>; total: number };

function buildRows(orders: ProductionOrder[]) {
  const rows = new Map<string, Row>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = `${it.group}|${it.name}`;
      const row = rows.get(key) ?? { name: it.name, group: it.group, cells: new Map(), total: 0 };
      const cell = row.cells.get(o.id) ?? { qty: 0, done: true };
      cell.qty += it.quantity;
      cell.done = cell.done && Boolean(it.producedAt);
      row.cells.set(o.id, cell);
      row.total += it.quantity;
      rows.set(key, row);
    }
  }
  return PRODUCTION_GROUPS.map((g) => ({
    ...g,
    rows: [...rows.values()].filter((r) => r.group === g.slug),
  })).filter((g) => g.rows.length > 0);
}

export default function ProductionSummary({ orders }: { orders: ProductionOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
        Teď není nic k výrobě — žádná zaplacená neodeslaná objednávka.
      </div>
    );
  }
  const groups = buildRows(orders);
  const totalPerOrder = (id: string) =>
    orders.find((o) => o.id === id)?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const grandTotal = orders.reduce((s, o) => s + totalPerOrder(o.id), 0);

  return (
    <div>
      {/* Počítač / tablet: tabulka */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm text-neutral-900">
          <thead>
            <tr>
              <th className="border border-neutral-300 bg-neutral-100 text-left p-2 w-56">Zákazník</th>
              {orders.map((o) => (
                <th key={o.id} className="border border-neutral-300 bg-neutral-100 text-left p-2 align-top font-medium">
                  <span className="text-neutral-500 font-normal">{o.orderNumber !== null ? formatOrderNumber(o.orderNumber) : ""}</span>
                  <span className="block font-semibold text-begina-primary-900">{o.customer}</span>
                  {o.contactName && o.contactName !== o.customer && (
                    <span className="block text-xs text-neutral-600 font-normal">{o.contactName}</span>
                  )}
                </th>
              ))}
              <th className="border border-neutral-300 bg-neutral-100 text-center p-2 w-20">Celkem</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border border-neutral-300 bg-neutral-50 text-left p-2 font-medium text-neutral-900">Doručit na</th>
              {orders.map((o) => (
                <td key={o.id} className="border border-neutral-300 p-2 align-top text-xs text-neutral-700">
                  {o.deliveryAddress ?? "—"}
                  {o.deliveryPhone && <span className="block">tel. {o.deliveryPhone}</span>}
                </td>
              ))}
              <td className="border border-neutral-300" />
            </tr>
            <tr>
              <th className="border border-neutral-300 bg-neutral-50 text-left p-2 font-medium text-neutral-900">Termín dodání</th>
              {orders.map((o) => (
                <td key={o.id} className="border border-neutral-300 p-2">
                  {o.deadline ? (
                    <span className="inline-block rounded bg-red-100 text-red-800 text-xs font-semibold px-1.5 py-0.5">
                      do {formatDeadlineShort(o.deadline)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              ))}
              <td className="border border-neutral-300" />
            </tr>
            <tr>
              <th className="border border-neutral-300 bg-neutral-50 text-left p-2 font-medium text-neutral-900">Vyrobeno</th>
              {orders.map((o) => (
                <td key={o.id} className="border border-neutral-300 p-2 text-xs text-neutral-700">
                  {o.producedCount} z {o.items.length} položek
                  <Link
                    href={`/rizeni-firmy/vyroba/${o.id}`}
                    className="mt-1 block w-fit rounded-lg bg-begina-primary-900 text-begina-primary-50 px-3 py-1.5 text-xs"
                  >
                    Otevřít kartu
                  </Link>
                </td>
              ))}
              <td className="border border-neutral-300" />
            </tr>
            {groups.map((g) => (
              <GroupRows key={g.slug} slug={g.slug} label={g.label} rows={g.rows} orders={orders} />
            ))}
            <tr>
              <td className="border border-neutral-300 bg-neutral-200 p-2 font-bold text-neutral-900">Celkem kusů</td>
              {orders.map((o) => (
                <td key={o.id} className="border border-neutral-300 bg-neutral-200 p-2 text-center font-bold text-neutral-900">
                  {totalPerOrder(o.id)}
                </td>
              ))}
              <td className="border border-neutral-300 bg-neutral-200 p-2 text-center font-bold text-neutral-900">{grandTotal}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-neutral-500 mt-2">✓ = už vyrobeno. Termín = 5 pracovních dnů od zaplacení.</p>
      </div>

      {/* Mobil: po produktech, pod tím klienti */}
      <div className="sm:hidden flex flex-col gap-1.5 text-neutral-900">
        {groups.map((g) => (
          <div key={g.slug}>
            <p className={`rounded-lg px-3 py-2 mt-2 text-xs font-bold uppercase tracking-wide text-begina-primary-900 ${GROUP_STYLE[g.slug].band}`}>
              {g.label}
            </p>
            {g.rows.map((r) => (
              <div key={r.name} className={`rounded-lg p-2.5 mt-1 ${GROUP_STYLE[g.slug].row}`}>
                <p className="text-[15px] font-semibold text-begina-primary-900">
                  {r.name} – {r.total} ks
                </p>
                <p className="text-xs text-neutral-700">
                  {orders
                    .filter((o) => r.cells.has(o.id))
                    .map((o) => `${o.customer} ${r.cells.get(o.id)!.qty}${r.cells.get(o.id)!.done ? " ✓" : ""}`)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2 className="text-sm font-medium text-begina-primary-900 mt-5 mb-2">Klienti k výrobě</h2>
      <div className="flex flex-col gap-2">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/rizeni-firmy/vyroba/${o.id}`}
            className="bg-white border border-neutral-200 rounded-xl p-3 flex items-center justify-between gap-3 min-w-0"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-begina-primary-900 break-words">
                {o.orderNumber !== null && <span className="text-neutral-500 font-normal mr-1.5">{formatOrderNumber(o.orderNumber)}</span>}
                {o.customer}
              </span>
              <span className="block text-xs text-neutral-600 break-words">{o.deliveryAddress ?? ""}</span>
              <span className="block text-xs text-neutral-600">
                Vyrobeno {o.producedCount} z {o.items.length}
                {o.deadline ? ` · termín do ${formatDeadlineShort(o.deadline)}` : ""}
              </span>
            </span>
            <span className="flex-none rounded-lg bg-begina-primary-900 text-begina-primary-50 px-3 py-2 text-sm">Karta</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GroupRows({
  slug,
  label,
  rows,
  orders,
}: {
  slug: string;
  label: string;
  rows: Row[];
  orders: ProductionOrder[];
}) {
  const style = GROUP_STYLE[slug];
  return (
    <>
      <tr>
        <td colSpan={orders.length + 2} className={`border border-neutral-300 p-2 text-xs font-bold uppercase tracking-wide text-neutral-900 ${style.band}`}>
          {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.name} className={style.row}>
          <td className="border border-neutral-300 p-2 font-medium text-neutral-900">{r.name}</td>
          {orders.map((o) => {
            const cell = r.cells.get(o.id);
            return (
              <td key={o.id} className="border border-neutral-300 p-2 text-center font-bold text-[16px] text-neutral-900">
                {cell ? `${cell.qty}${cell.done ? " ✓" : ""}` : ""}
              </td>
            );
          })}
          <td className="border border-neutral-300 p-2 text-center font-bold text-[16px] text-neutral-900">{r.total}</td>
        </tr>
      ))}
    </>
  );
}
