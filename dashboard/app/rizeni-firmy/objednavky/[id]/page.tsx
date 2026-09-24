import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderDetail, listInternalStaff } from "@/lib/data/orders";
import { formatCzechDate, formatKc } from "@/lib/format";
import { FulfillmentBadge, PaymentBadge } from "../OrderStatusBadges";
import FulfillmentStatusForm from "../FulfillmentStatusForm";
import PaymentStatusForm from "../PaymentStatusForm";
import ResponsibleForm from "../ResponsibleForm";
import NoteForm from "../NoteForm";
import OrderActivityTimeline from "../OrderActivityTimeline";

// Security Phase 15 (Objednávky 1.0) — detail objednávky. Autorizace (ADMIN
// nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touto stránkou,
// getOrderDetail/listInternalStaff si ji navíc ověřují samy, stejný princip
// jako getNodeDetail.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderDetailPage(
  props: PageProps<"/rizeni-firmy/objednavky/[id]">
) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getOrderDetail(id);
  if (!detail) {
    notFound();
  }
  const { order, items, activity } = detail;
  const staff = await listInternalStaff();

  return (
    <div>
      <Link
        href="/rizeni-firmy/objednavky"
        className="text-sm text-neutral-500 hover:text-begina-primary-900"
      >
        ← Objednávky
      </Link>

      <div className="flex items-start justify-between gap-3 mt-1 mb-1">
        <h1 className="text-lg font-medium text-begina-primary-900">{order.buyerOrganizationName}</h1>
        <p className="text-lg font-medium text-begina-primary-900 whitespace-nowrap">
          {formatKc(order.totalKc)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <FulfillmentBadge status={order.fulfillmentStatus} />
        <PaymentBadge status={order.paymentStatus} overdue={order.paymentOverdue} />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Kdo objednal</p>
          <p className="text-sm text-begina-primary-900">{order.contactName ?? "Neuvedeno"}</p>
          {(order.contactPhone || order.contactEmail) && (
            <p className="text-xs text-neutral-500">
              {[order.contactPhone, order.contactEmail].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Objednáno</p>
            <p className="text-sm text-begina-primary-900">{formatCzechDate(order.orderedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Plánované doručení</p>
            <p className="text-sm text-begina-primary-900">
              {order.plannedDeliveryAt ? formatCzechDate(order.plannedDeliveryAt) : "Neuvedeno"}
            </p>
          </div>
        </div>

        {order.enteredByName && (
          <p className="text-xs text-neutral-400">Zapsal(a) do systému: {order.enteredByName}</p>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-begina-primary-900 mb-2">Položky</p>
        <div className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-neutral-700">
                {item.quantity}× {item.name}
              </span>
              <span className="text-neutral-500">{formatKc(item.lineTotalKc)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-200 mt-2 pt-2 flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between text-neutral-500">
            <span>Mezisoučet</span>
            <span>{formatKc(order.subtotalKc)}</span>
          </div>
          {order.shippingKc > 0 && (
            <div className="flex items-center justify-between text-neutral-500">
              <span>Doprava</span>
              <span>{formatKc(order.shippingKc)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-medium text-begina-primary-900">
            <span>Celkem</span>
            <span>{formatKc(order.totalKc)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-4">
        <FulfillmentStatusForm orderId={order.id} currentStatus={order.fulfillmentStatus} />
        <PaymentStatusForm orderId={order.id} currentStatus={order.paymentStatus} />
        <ResponsibleForm
          orderId={order.id}
          responsibleUserId={order.responsibleUserId}
          responsibleName={order.responsibleName}
          staff={staff}
        />
        <NoteForm orderId={order.id} currentNote={order.note} />
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivita</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <OrderActivityTimeline activity={activity} />
        </div>
      </div>
    </div>
  );
}
