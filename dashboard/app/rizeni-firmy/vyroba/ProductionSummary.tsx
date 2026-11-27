import Link from "next/link";
import { PRODUCTION_GROUPS, type AwaitingPaymentOrder, type ProductionOrder } from "@/lib/data/productionBoard";
import { formatOrderNumber } from "@/lib/data/orderBuyer";
import { formatDeadlineShort } from "@/lib/czWorkdays";
import { GROUP_STYLE } from "./productionColors";
import ProducedCell from "./ProducedCell";
import { formatKc } from "@/lib/format";

// Souhrnná výrobní tabulka (Lucie 18. 11. 2026) — jako „Objednávky výroba
// Jarda“: sloupce = zaplacení klienti, řádky = objednané produkty po
// skupinách, vpravo Celkem. Na mobilu seznam po produktech (nic neujíždí).

export type OrderMoney = { goodsKc: number; shippingKc: number; costKc: number; unknown: string[] };

// Částky jako všude v MojeBegina: 2 desetinná místa (Lucie 26. 11. 2026).
const kc0 = (n: number) => formatKc(Math.round(n * 100) / 100);

type Row = { name: string; group: string; cells: Map<string, { qty: number; done: boolean; itemIds: string[] }>; total: number; doneQty: number };

function buildRows(orders: ProductionOrder[]) {
  const rows = new Map<string, Row>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = `${it.group}|${it.name}`;
      const row = rows.get(key) ?? { name: it.name, group: it.group, cells: new Map(), total: 0, doneQty: 0 };
      const cell = row.cells.get(o.id) ?? { qty: 0, done: true, itemIds: [] };
      cell.qty += it.quantity;
      cell.done = cell.done && Boolean(it.producedAt);
      cell.itemIds.push(it.id);
      if (it.producedAt) row.doneQty += it.quantity;
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

export default function ProductionSummary({ orders, awaiting = [], money }: { orders: ProductionOrder[]; awaiting?: AwaitingPaymentOrder[]; money?: Record<string, OrderMoney> }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Teď není nic k výrobě — žádná zaplacená neodeslaná objednávka.
        </div>
        {awaiting.length > 0 && (
          <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-700">
            Čeká na zaplacení: {awaiting.map((a) => `${a.orderNumber ?? ""} ${a.customer}`.trim()).join(", ")}
          </div>
        )}
      </div>
    );
  }
  const groups = buildRows(orders);
  const totalPerOrder = (id: string) =>
    orders.find((o) => o.id === id)?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const grandTotal = orders.reduce((s, o) => s + totalPerOrder(o.id), 0);
  // Zákazník komplet (Lucie 27. 11. 2026): všechno vyrobeno → celý sloupec zezelená.
  const complete = new Set(orders.filter((o) => o.items.length > 0 && o.items.every((i) => i.producedAt)).map((o) => o.id));
  const colBg = (id: string, base = "") => (complete.has(id) ? "bg-emerald-100" : base);

  return (
    <div>
      {/* Počítač / tablet: tabulka */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm text-neutral-900">
          <thead>
            <tr>
              <th className="border border-neutral-300 bg-neutral-100 text-left p-2 w-56">Zákazník</th>
              {orders.map((o) => (
                <th key={o.id} className={`border border-neutral-300 text-left p-2 align-top font-medium ${colBg(o.id, "bg-neutral-100")}`}>
                  <span className="text-neutral-500 font-normal">{o.orderNumber !== null ? formatOrderNumber(o.orderNumber) : ""}</span>
                  <span className="block font-semibold text-begina-primary-900">{o.customer}</span>
                  {o.contactName && o.contactName !== o.customer && (
                    <span className="block text-xs text-neutral-600 font-normal">{o.contactName}</span>
                  )}
                  {complete.has(o.id) && (
                    <span className="mt-1 inline-block rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">✓ komplet</span>
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
                <td key={o.id} className={`border border-neutral-300 p-2 align-top text-xs text-neutral-700 ${colBg(o.id)}`}>
                  {o.deliveryAddress ?? "—"}
                  {o.deliveryPhone && <span className="block">tel. {o.deliveryPhone}</span>}
                </td>
              ))}
              <td className="border border-neutral-300" />
            </tr>
            <tr>
              <th className="border border-neutral-300 bg-neutral-50 text-left p-2 font-medium text-neutral-900">Termín dodání</th>
              {orders.map((o) => (
                <td key={o.id} className={`border border-neutral-300 p-2 ${colBg(o.id)}`}>
                  {o.deadline ? (
                    <span className="inline-block rounded bg-red-100 text-red-800 text-xs font-semibold px-1.5 py-0.5">
                      do {formatDeadlineShort(o.deadline)}
                    </span>
                  ) : (
                    "—"
                  )}
                  {o.payLater && (
                    <span className="block mt-1 text-xs font-semibold text-amber-800">💵 platí {o.paymentMethod} při předání</span>
                  )}
                </td>
              ))}
              <td className="border border-neutral-300" />
            </tr>
            <tr>
              <th className="border border-neutral-300 bg-neutral-50 text-left p-2 font-medium text-neutral-900">Vyrobeno</th>
              {orders.map((o) => (
                <td key={o.id} className={`border border-neutral-300 p-2 text-xs text-neutral-700 ${colBg(o.id)}`}>
                  {complete.has(o.id) ? <span className="font-bold text-emerald-800">✓ Komplet – {o.producedCount} z {o.items.length}</span> : <>{o.producedCount} z {o.items.length} položek</>}
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
              <GroupRows key={g.slug} slug={g.slug} label={g.label} rows={g.rows} orders={orders} complete={complete} />
            ))}
            <tr>
              <td className="border border-neutral-300 bg-neutral-200 p-2 font-bold text-neutral-900">Celkem kusů</td>
              {orders.map((o) => (
                <td
                  key={o.id}
                  className={`border border-neutral-300 p-2 text-center font-bold ${complete.has(o.id) ? "bg-emerald-500 text-white" : "bg-neutral-200 text-neutral-900"}`}
                >
                  {complete.has(o.id) ? `✓ ${totalPerOrder(o.id)}` : totalPerOrder(o.id)}
                </td>
              ))}
              <td className="border border-neutral-300 bg-neutral-200 p-2 text-center font-bold text-neutral-900">{grandTotal}</td>
            </tr>
            {money && <MoneyRows orders={orders} money={money} />}
          </tbody>
        </table>
        <p className="text-xs text-neutral-600 mt-2">Kliknutím na číslo označíš produkt jako vyrobený (zelená ✓), dalším kliknutím vrátíš zpět. Termín = 5 pracovních dnů od zaplacení (u placených hotově / na fakturu od objednání).</p>
      </div>

      {/* Mobil: karta za každého klienta (co vyrobit, kam, do kdy), pod tím součty */}
      <div className="sm:hidden flex flex-col gap-3 text-neutral-900">
        {orders.map((o) => {
          const byGroup = PRODUCTION_GROUPS.map((g) => ({ ...g, items: o.items.filter((i) => i.group === g.slug) })).filter((g) => g.items.length > 0);
          return (
            <div key={o.id} className={`border-2 rounded-2xl p-3 ${complete.has(o.id) ? "bg-emerald-50 border-emerald-500" : "bg-white border-red-300"}`}>
              {complete.has(o.id) && <p className="mb-1 text-sm font-bold text-emerald-700">✓ Komplet – všechno vyrobeno</p>}
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-bold text-neutral-900 break-words min-w-0">
                  {o.orderNumber !== null && <span className="text-neutral-500 font-normal text-sm mr-1">{formatOrderNumber(o.orderNumber)}</span>}
                  {o.customer}
                </p>
                {o.deadline && (
                  <span className="flex-none rounded-md bg-red-100 text-red-800 text-xs font-bold px-2 py-1">do {formatDeadlineShort(o.deadline)}</span>
                )}
              </div>
              {o.payLater && <p className="text-sm font-semibold text-amber-800 mt-1">💵 Platí {o.paymentMethod} při předání</p>}
              {o.deliveryAddress && <p className="text-sm text-neutral-800 mt-1 break-words">📍 {o.deliveryAddress}</p>}
              {o.deliveryPhone && (
                <a href={`tel:${o.deliveryPhone.replace(/\s+/g, "")}`} className="text-sm text-neutral-800 underline">
                  📞 {o.deliveryPhone}
                </a>
              )}
              {byGroup.map((g) => (
                <div key={g.slug} className="mt-2">
                  <p className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-neutral-900 ${GROUP_STYLE[g.slug].band}`}>{g.label}</p>
                  {g.items.map((it) => (
                    <p key={it.id} className={`flex items-center gap-2 px-2 py-1.5 text-[15px] ${GROUP_STYLE[g.slug].row} ${it.producedAt ? "line-through text-neutral-500" : "text-neutral-900"}`}>
                      <span className="font-extrabold min-w-[2.2rem]">{it.quantity}×</span>
                      <span className="flex-1 min-w-0 break-words">{it.name}</span>
                      {it.producedAt && <span className="no-underline text-emerald-700 font-bold">✓</span>}
                    </p>
                  ))}
                </div>
              ))}
              {money?.[o.id] && <MoneyCard m={money[o.id]} />}
              <Link
                href={`/rizeni-firmy/vyroba/${o.id}`}
                className="mt-3 block text-center rounded-xl bg-begina-primary-900 text-begina-primary-50 py-3 text-[15px] font-medium"
              >
                Otevřít kartu a odškrtat ({o.producedCount}/{o.items.length})
              </Link>
            </div>
          );
        })}

        {money && (
          <MoneyCard
            title="Celkem všichni klienti"
            m={{
              goodsKc: orders.reduce((t, o) => t + (money[o.id]?.goodsKc ?? 0), 0),
              shippingKc: orders.reduce((t, o) => t + (money[o.id]?.shippingKc ?? 0), 0),
              costKc: orders.reduce((t, o) => t + (money[o.id]?.costKc ?? 0), 0),
              unknown: orders.flatMap((o) => money[o.id]?.unknown ?? []),
            }}
          />
        )}
        <details className="bg-white border border-neutral-200 rounded-xl p-3">
          <summary className="text-sm font-semibold text-neutral-900">Celkem k výrobě (všichni klienti)</summary>
          {groups.map((g) => (
            <div key={g.slug} className="mt-2">
              <p className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-neutral-900 ${GROUP_STYLE[g.slug].band}`}>{g.label}</p>
              {g.rows.map((r) => (
                <p key={r.name} className={`flex justify-between gap-2 px-2 py-1.5 text-[15px] text-neutral-900 ${GROUP_STYLE[g.slug].row}`}>
                  <span className="min-w-0 break-words">{r.name}</span>
                  <span className="font-extrabold whitespace-nowrap">{r.total} ks</span>
                </p>
              ))}
            </div>
          ))}
        </details>
      </div>

      {/* Počítač: seznam klientů s tlačítkem na kartu */}
      <h2 className="hidden sm:block text-sm font-medium text-begina-primary-900 mt-5 mb-2">Klienti k výrobě</h2>
      <div className="hidden sm:flex flex-col gap-2">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/rizeni-firmy/vyroba/${o.id}`}
            className={`border rounded-xl p-3 flex items-center justify-between gap-3 min-w-0 ${complete.has(o.id) ? "bg-emerald-50 border-emerald-500" : "bg-white border-neutral-200"}`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-begina-primary-900 break-words">
                {o.orderNumber !== null && <span className="text-neutral-500 font-normal mr-1.5">{formatOrderNumber(o.orderNumber)}</span>}
                {o.customer}
              </span>
              <span className="block text-xs text-neutral-600 break-words">{o.deliveryAddress ?? ""}</span>
              <span className="block text-xs text-neutral-600">
                {complete.has(o.id) ? "✓ Komplet – vyrobeno" : "Vyrobeno"} {o.producedCount} z {o.items.length}
                {o.deadline ? ` · termín do ${formatDeadlineShort(o.deadline)}` : ""}
                {o.payLater ? ` · platí ${o.paymentMethod} při předání` : ""}
              </span>
            </span>
            <span className="flex-none rounded-lg bg-begina-primary-900 text-begina-primary-50 px-3 py-2 text-sm">Karta</span>
          </Link>
        ))}
      </div>

      {awaiting.length > 0 && (
        <div className="mt-5 bg-neutral-100 border border-neutral-200 rounded-xl p-3">
          <p className="text-sm font-semibold text-neutral-800">Čeká na zaplacení — do výroby přijde až po platbě ({awaiting.length})</p>
          <ul className="mt-1 text-sm text-neutral-700">
            {awaiting.map((a) => (
              <li key={a.id}>
                <Link href={`/rizeni-firmy/objednavky/${a.id}`} className="underline">
                  {a.orderNumber !== null ? `${formatOrderNumber(a.orderNumber)} ` : ""}
                  {a.customer}
                </Link>{" "}
                · {a.totalKc.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč · {a.paymentMethod ?? "platba"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GroupRows({
  slug,
  label,
  rows,
  orders,
  complete,
}: {
  slug: string;
  label: string;
  rows: Row[];
  orders: ProductionOrder[];
  complete: Set<string>;
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
              <td key={o.id} className={`border border-neutral-300 p-1.5 text-center ${complete.has(o.id) ? "bg-emerald-100" : ""}`}>
                {cell ? <ProducedCell orderId={o.id} itemIds={cell.itemIds} qty={cell.qty} done={cell.done} /> : null}
              </td>
            );
          })}
          <td className="border border-neutral-300 p-2 text-center text-neutral-900">
            <span className="block font-bold text-[16px]">{r.total}</span>
            {r.doneQty >= r.total ? (
              <span className="block text-xs font-semibold text-emerald-700">hotovo</span>
            ) : r.doneQty > 0 ? (
              <span className="block text-xs font-semibold text-red-700">zbývá {r.total - r.doneQty}</span>
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}

/** Hodnota zboží, náklad a marže po zákaznících — vidí jen Lucie a Jarin (Jarin 27. 11. 2026). */
function MoneyRows({ orders, money }: { orders: ProductionOrder[]; money: Record<string, OrderMoney> }) {
  const sum = (pick: (m: OrderMoney) => number) => orders.reduce((s, o) => s + (money[o.id] ? pick(money[o.id]) : 0), 0);
  const goods = sum((m) => m.goodsKc);
  const cost = sum((m) => m.costKc);
  const pct = (g: number, c: number) => (g > 0 ? ` · ${Math.round(((g - c) / g) * 100)} %` : "");
  const cell = "border border-neutral-300 p-2 text-center whitespace-nowrap tabular-nums";
  const head = "border border-neutral-300 bg-neutral-50 p-2 text-left font-medium text-neutral-900";
  return (
    <>
      <tr>
        <th className={head}>
          Hodnota zboží
          <span className="block text-xs font-normal text-neutral-500">po slevě, bez dopravy</span>
        </th>
        {orders.map((o) => (
          <td key={o.id} className={cell}>
            {money[o.id] ? kc0(money[o.id].goodsKc) : "—"}
            {money[o.id]?.shippingKc ? <span className="block text-xs text-neutral-500">+ doprava {kc0(money[o.id].shippingKc)}</span> : null}
          </td>
        ))}
        <td className={`${cell} font-bold`}>{kc0(goods)}</td>
      </tr>
      <tr>
        <th className={head}>
          Náklad
          <span className="block text-xs font-normal text-neutral-500">suroviny + obal</span>
        </th>
        {orders.map((o) => {
          const m = money[o.id];
          return (
            <td key={o.id} className={cell}>
              {m ? kc0(m.costKc) : "—"}
              {m && m.unknown.length > 0 && (
                <span className="block whitespace-normal text-xs text-amber-700" title={m.unknown.join(", ")}>
                  bez nákladu (není recept): {m.unknown.join(", ")}
                </span>
              )}
            </td>
          );
        })}
        <td className={`${cell} font-bold`}>{kc0(cost)}</td>
      </tr>
      <tr className="bg-emerald-50">
        <th className={`${head} bg-emerald-50`}>Marže</th>
        {orders.map((o) => {
          const m = money[o.id];
          return (
            <td key={o.id} className={`${cell} font-semibold text-emerald-800`}>
              {m ? `${kc0(m.goodsKc - m.costKc)}${pct(m.goodsKc, m.costKc)}` : "—"}
            </td>
          );
        })}
        <td className={`${cell} font-bold text-emerald-800`}>
          {kc0(goods - cost)}
          {pct(goods, cost)}
        </td>
      </tr>
    </>
  );
}

/** Mobil: hodnota, náklad a marže v kartě zákazníka (Lucie 27. 11. 2026). */
function MoneyCard({ m, title }: { m: OrderMoney; title?: string }) {
  const margin = m.goodsKc - m.costKc;
  const pct = m.goodsKc > 0 ? Math.round((margin / m.goodsKc) * 100) : null;
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <p className="flex justify-between gap-2"><span className="text-neutral-600">Hodnota zboží</span><span className="tabular-nums">{kc0(m.goodsKc)}</span></p>
      {m.shippingKc > 0 && <p className="flex justify-between gap-2 text-xs text-neutral-500"><span>+ doprava</span><span className="tabular-nums">{kc0(m.shippingKc)}</span></p>}
      <p className="flex justify-between gap-2"><span className="text-neutral-600">Náklad (suroviny + obal)</span><span className="tabular-nums">{kc0(m.costKc)}</span></p>
      <p className="flex justify-between gap-2 font-semibold text-emerald-800"><span>Marže</span><span className="tabular-nums">{kc0(margin)}{pct !== null ? ` · ${pct} %` : ""}</span></p>
      {m.unknown.length > 0 && <p className="mt-1 text-xs text-amber-700">Bez nákladu (není recept): {m.unknown.join(", ")}</p>}
    </div>
  );
}
