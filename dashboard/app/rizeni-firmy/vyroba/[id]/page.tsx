import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductionOrder, PRODUCTION_GROUPS } from "@/lib/data/productionBoard";
import { formatOrderNumber } from "@/lib/data/orderBuyer";
import { formatCzechDate, formatCzechDateTime } from "@/lib/format";
import { formatDeadlineLong } from "@/lib/czWorkdays";
import ProducedCheck from "../ProducedCheck";
import { GROUP_STYLE } from "../productionColors";

// Výrobní karta jedné objednávky pro Jarina (Lucie 18. 11. 2026):
// doručovací údaje (ne fakturační), termín dodání, produkty barevně po
// skupinách a zaškrtávání vyrobených položek.
export const dynamic = "force-dynamic";

export default async function ProductionCardPage(props: PageProps<"/rizeni-firmy/vyroba/[id]">) {
  const { id } = await props.params;
  const order = await getProductionOrder(id);
  if (!order) notFound();

  const groups = PRODUCTION_GROUPS.map((g) => ({
    ...g,
    items: order.items.filter((i) => i.group === g.slug),
  })).filter((g) => g.items.length > 0);
  const allDone = order.items.length > 0 && order.producedCount === order.items.length;

  return (
    <div>
      <Link href="/rizeni-firmy/vyroba" className="text-sm text-neutral-600 underline">
        ← Zpět na výrobu
      </Link>

      <div className="bg-white border border-neutral-200 rounded-2xl p-4 mt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="text-xs text-neutral-500">
              {order.orderNumber !== null ? `Objednávka ${formatOrderNumber(order.orderNumber)}` : "Objednávka"}
              {order.paidAt
                ? ` · zaplaceno ${formatCzechDate(order.paidAt)}`
                : order.payLater
                  ? ` · platí ${order.paymentMethod} při předání`
                  : " · zatím nezaplaceno"}
            </p>
            <p className="text-lg font-bold text-begina-primary-900 break-words">{order.customer}</p>
            {order.contactName && order.contactName !== order.customer && (
              <p className="text-sm text-begina-primary-900">{order.contactName}</p>
            )}
            {order.deadline && (
              <p className="mt-2 inline-block rounded-md bg-red-100 text-red-800 text-sm font-semibold px-2 py-1">
                Termín dodání: do {formatDeadlineLong(order.deadline)}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Doručit na</p>
            {order.deliveryName && <p className="text-sm text-begina-primary-900">{order.deliveryName}</p>}
            <p className="text-[15px] font-semibold text-begina-primary-900 break-words">
              {order.deliveryAddress ?? "Adresa chybí — zkontrolujte objednávku"}
            </p>
            {order.deliveryPhone && (
              <p className="text-sm">
                <a href={`tel:${order.deliveryPhone.replace(/\s+/g, "")}`} className="underline text-begina-primary-900">
                  tel. {order.deliveryPhone}
                </a>
              </p>
            )}
            {order.email && <p className="text-sm text-begina-primary-900 break-all">{order.email}</p>}
            {order.shippingMethod && <p className="text-xs text-neutral-500 mt-1">{order.shippingMethod}</p>}
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.slug} className="mt-4">
            <p className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-neutral-900 ${GROUP_STYLE[g.slug].band}`}>
              {g.label}
            </p>
            {g.items.map((item) => (
              <ProducedCheck
                key={item.id}
                orderId={order.id}
                itemId={item.id}
                produced={Boolean(item.producedAt)}
                quantity={item.quantity}
                name={item.name}
                rowClass={GROUP_STYLE[g.slug].row}
                producedNote={
                  item.producedAt
                    ? `vyrobeno ${formatCzechDateTime(item.producedAt)}${item.producedByName ? ` · ${item.producedByName}` : ""}`
                    : null
                }
              />
            ))}
          </div>
        ))}

        <p className="mt-4 text-sm text-begina-primary-900">
          <b>
            Vyrobeno {order.producedCount} z {order.items.length} položek.
          </b>{" "}
          {allDone
            ? "Hotovo — objednávka je „Připravená“, můžeš ji odeslat."
            : "Až zaškrtneš všechno, objednávka se sama přepne na „Připravená“."}
        </p>
        {order.customerNote && (
          <p className="mt-2 text-sm text-neutral-600 break-words">
            <span className="font-medium">Poznámka zákazníka:</span> {order.customerNote}
          </p>
        )}
        <p className="mt-3">
          <Link href={`/rizeni-firmy/objednavky/${order.id}`} className="text-sm underline text-neutral-600">
            Detail objednávky (odesláno, faktura)
          </Link>
        </p>
      </div>
    </div>
  );
}
