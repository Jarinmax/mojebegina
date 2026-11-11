import Link from "next/link";
import { getProductionCard } from "@/lib/data/productionCard";
import { AssignProductionCardForm, InviteProductionForm, ResolveRequestForm, StockRequestForm } from "./Forms";

export const dynamic = "force-dynamic";

const date = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "medium" });
const datetime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "medium", timeStyle: "short" });

const FULFILLMENT_LABELS: Record<string, string> = {
  new: "Nová",
  confirmed: "Potvrzená",
  preparing: "Připravuje se",
  ready: "Hotovo",
  out_for_delivery: "Na cestě",
  delivered: "Doručeno",
};

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export default async function PetrProductionPage() {
  const view = await getProductionCard();
  const nearestDeadline = view.queue.find((o) => o.plannedDeliveryAt)?.plannedDeliveryAt ?? null;

  return <main className="min-h-screen bg-neutral-50 px-4 py-6">
    <div className="mx-auto max-w-4xl">
      <Link href={view.access.isAdmin ? "/rizeni-firmy" : "/"} className="text-sm text-neutral-500">← Zpět</Link>
      <div className="mt-3 mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Karta výroby</p>
        <h1 className="text-2xl font-semibold text-begina-primary-900">{view.card.displayName}</h1>
        <p className="mt-1 text-sm text-neutral-600">Výroba a kuchyně · fronta objednávek, suroviny skladem, žádosti o doplnění</p>
        {view.assignee && <p className="mt-1 text-sm text-emerald-700">Připojeno: {view.assignee.name ?? view.assignee.email}</p>}
      </div>

      {view.access.isAdmin && !view.assignee && <div className="mb-4"><InviteProductionForm /></div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Objednávek ve frontě", String(view.queue.length)],
          ["Druhů k výrobě", String(view.toMakeTotals.length)],
          ["Nejbližší termín", nearestDeadline ? date.format(nearestDeadline) : "—"],
          ["Otevřených žádostí", String(view.openRequestCount)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-xl font-semibold text-begina-primary-900">{value}</p></div>)}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Co se bude vyrábět</h2>
        {view.toMakeTotals.length === 0
          ? <p className="text-sm text-neutral-500">Fronta je prázdná — nic nečeká na výrobu.</p>
          : <div className="grid gap-2 md:grid-cols-2">{view.toMakeTotals.map((row) => <div key={row.name} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"><span className="text-sm text-begina-primary-900">{row.name}</span><strong className="text-sm">{qty(row.quantity)} ks</strong></div>)}</div>}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Fronta objednávek</h2>
        <div className="grid gap-2">{view.queue.map((order) => <div key={order.id} className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-begina-primary-900">{order.customerLabel}</p>
              <p className="mt-1 text-xs text-neutral-500">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</p>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">{FULFILLMENT_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus}</span>
              <p className="mt-1 text-xs text-neutral-500">{order.plannedDeliveryAt ? `do ${date.format(order.plannedDeliveryAt)}` : "termín neuveden"}</p>
            </div>
          </div>
        </div>)}{view.queue.length === 0 && <p className="text-sm text-neutral-500">Žádná objednávka nečeká na výrobu.</p>}</div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Suroviny skladem</h2>
        <div className="grid gap-2 md:grid-cols-2">{view.ingredients.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"><span className="text-sm text-begina-primary-900">{item.name}</span><strong className="text-sm">{qty(item.currentQuantity)} {item.canonicalUnit}</strong></div>)}{view.ingredients.length === 0 && <p className="text-sm text-neutral-500">Ve skladu zatím nejsou žádné surovinové karty.</p>}</div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <StockRequestForm ingredients={view.ingredients.map(({ id, name, canonicalUnit }) => ({ id, name, canonicalUnit }))} />
        {view.access.isAdmin && <AssignProductionCardForm />}
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Žádosti o doplnění / přípravu</h2>
        <div className="grid gap-2">{view.requests.map((request) => <div key={request.id} className={`rounded-lg border p-3 text-sm ${request.status === "open" ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              {request.stockItemName && <p className="font-medium text-begina-primary-900">{request.stockItemName}</p>}
              <p className="mt-0.5 text-neutral-700">{request.note}</p>
              <p className="mt-1 text-xs text-neutral-500">{datetime.format(request.createdAt)}</p>
            </div>
            {request.status === "open"
              ? (view.access.isAdmin ? <ResolveRequestForm requestId={request.id} /> : <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Čeká</span>)
              : <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">Vyřízeno</span>}
          </div>
        </div>)}{view.requests.length === 0 && <p className="text-sm text-neutral-500">Zatím žádná žádost.</p>}</div>
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Nedávno vyrobeno</h2>
        <div className="grid gap-2">{view.produced.map((order) => <div key={order.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"><div className="flex justify-between"><span>{order.customerLabel}</span><span className="text-xs text-neutral-500">{FULFILLMENT_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus}</span></div></div>)}{view.produced.length === 0 && <p className="text-sm text-neutral-500">Zatím nic vyrobeno.</p>}</div>
      </section>
    </div>
  </main>;
}
