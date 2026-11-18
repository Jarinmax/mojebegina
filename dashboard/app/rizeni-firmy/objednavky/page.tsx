import Link from "next/link";
import { listOrders } from "@/lib/data/orders";
import OrderCard from "./OrderCard";
import OrderSummaryTiles from "./OrderSummaryTiles";

// Security Phase 15 (Objednávky 1.0) — provozní seznam objednávek.
// Autorizace (ADMIN nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad
// touto stránkou, listOrders si ji navíc ověřuje sama (requireOrderContext),
// stejný princip jako getCompanyMap.
export const dynamic = "force-dynamic";

const FILTERS = {
  new: (o: Awaited<ReturnType<typeof listOrders>>["orders"][number]) => o.fulfillmentStatus === "new",
  in_process: (o: Awaited<ReturnType<typeof listOrders>>["orders"][number]) =>
    o.fulfillmentStatus === "confirmed" || o.fulfillmentStatus === "preparing",
  ready_for_delivery: (o: Awaited<ReturnType<typeof listOrders>>["orders"][number]) =>
    o.fulfillmentStatus === "ready" || o.fulfillmentStatus === "out_for_delivery",
  awaiting_payment: (o: Awaited<ReturnType<typeof listOrders>>["orders"][number]) =>
    o.paymentStatus === "unpaid" || o.paymentStatus === "invoiced",
  // Zrušené (stornované) objednávky jsou standardně schované — jen pod tímto filtrem.
  zrusene: (o: Awaited<ReturnType<typeof listOrders>>["orders"][number]) => o.fulfillmentStatus === "cancelled",
} as const;

const FILTER_LABELS: Record<keyof typeof FILTERS, string> = {
  new: "Nové",
  in_process: "V procesu",
  ready_for_delivery: "K doručení",
  awaiting_payment: "Čeká na platbu",
  zrusene: "Zrušené",
};

export default async function OrdersPage(props: PageProps<"/rizeni-firmy/objednavky">) {
  const searchParams = await props.searchParams;
  const filterParam = Array.isArray(searchParams.filter) ? searchParams.filter[0] : searchParams.filter;
  const activeFilter = filterParam && filterParam in FILTERS ? (filterParam as keyof typeof FILTERS) : null;

  const { orders, counts } = await listOrders();
  const showCancelled = activeFilter === "zrusene";
  const activeOrders = showCancelled ? orders : orders.filter((o) => o.fulfillmentStatus !== "cancelled");
  const visibleOrders = activeFilter ? activeOrders.filter(FILTERS[activeFilter]) : activeOrders;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900 mt-1">Objednávky</h1>
        </div>
        <Link
          href="/rizeni-firmy/objednavky/nova"
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 whitespace-nowrap"
        >
          Nová objednávka
        </Link>
      </div>

      <div className="mb-3 mt-3">
        <OrderSummaryTiles counts={counts} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          href={showCancelled ? "/rizeni-firmy/objednavky" : "/rizeni-firmy/objednavky?filter=zrusene"}
          className={`text-sm rounded-full border px-4 py-2 ${
            showCancelled
              ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900"
              : "bg-white text-begina-primary-900 border-neutral-300"
          }`}
        >
          Zrušené ({counts.cancelled})
        </Link>
        <Link
          href="/rizeni-firmy/vyroba"
          className="text-sm rounded-full border px-4 py-2 bg-white text-begina-primary-900 border-neutral-300"
        >
          Výroba →
        </Link>
      </div>

      {activeFilter && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <span className="text-neutral-500">Filtr: {FILTER_LABELS[activeFilter]}</span>
          <Link href="/rizeni-firmy/objednavky" className="text-begina-primary-900 hover:underline">
            Zrušit filtr
          </Link>
        </div>
      )}

      {visibleOrders.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          {orders.length === 0 ? "Zatím žádná objednávka." : showCancelled ? "Žádná zrušená objednávka." : "V tomto filtru žádná objednávka."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
