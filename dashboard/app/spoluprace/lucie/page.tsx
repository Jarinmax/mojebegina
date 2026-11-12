import Link from "next/link";
import { getLucieCollaboratorCard } from "@/lib/data/collaboratorCards";
import { InviteCollaboratorForm, PayoutForm, ProductMovementForm, WorkEntryForm, WorkEntryRow } from "./Forms";

export const dynamic = "force-dynamic";

const kc = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "medium" });

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export default async function LucieCollaboratorPage() {
  const view = await getLucieCollaboratorCard();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  return <main className="min-h-screen bg-neutral-50 px-4 py-6">
    <div className="mx-auto max-w-4xl">
      <Link href={view.access.isAdmin ? "/rizeni-firmy" : "/"} className="text-sm text-neutral-500">← Zpět</Link>
      <div className="mt-3 mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Karta spolupracovnice</p>
        <h1 className="text-2xl font-semibold text-begina-primary-900">{view.card.displayName}</h1>
        <p className="mt-1 text-sm text-neutral-600">Sociální sítě · med a medové svíčky od {view.card.supplierContactName ?? "dodavatele"} · provize {view.card.defaultCommissionPercent} %</p>
        {view.assignee && <p className="mt-1 text-sm text-emerald-700">Připojeno: {view.assignee.name ?? view.assignee.email}</p>}
      </div>

      {view.access.isAdmin && !view.assignee && <div className="mb-4"><InviteCollaboratorForm /></div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Příspěvky", String(view.summary.postCount)],
          ["Odpracováno", hours(view.summary.durationMinutes)],
          ["Celkem vyděláno", kc.format(view.summary.earnedKc)],
          ["Zbývá vyplatit", kc.format(view.summary.remainingKc)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-xl font-semibold text-begina-primary-900">{value}</p></div>)}
      </section>
      <p className="mt-2 text-xs text-neutral-500">Práce {kc.format(view.summary.workEarnedKc)} · provize z prodeje {kc.format(view.summary.salesCommissionKc)} · vyplaceno {kc.format(view.summary.paidKc)}</p>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Med a medové svíčky</h2>
        <div className="grid gap-3 md:grid-cols-2">{view.products.map((product) => <div key={product.id} className={`rounded-xl border bg-white p-4 ${product.lowStock ? "border-red-300" : "border-neutral-200"}`}>
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-begina-primary-900">{product.name}</h3><p className="text-sm text-neutral-500">Provize {product.commissionPercent} %</p></div>{product.lowStock && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Doobjednat</span>}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-neutral-500">Skladem</p><p className="font-semibold">{product.stock} ks</p></div><div><p className="text-xs text-neutral-500">Prodáno</p><p className="font-semibold">{product.sold} ks</p></div><div><p className="text-xs text-neutral-500">Provize</p><p className="font-semibold">{kc.format(product.commissionKc)}</p></div></div>
          {product.lowStock && <p className="mt-3 text-sm text-red-700">Zbývá nejvýš {product.lowStockThreshold} ks — kontaktovat {view.card.supplierContactName ?? "dodavatele"}.</p>}
        </div>)}</div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <WorkEntryForm today={today} />
        <ProductMovementForm products={view.products.map(({ id, name }) => ({ id, name }))} kind="stock_in" />
        <ProductMovementForm products={view.products.map(({ id, name }) => ({ id, name }))} kind="sale" />
        {view.access.isAdmin && <PayoutForm remainingKc={view.summary.remainingKc} />}
      </section>

      <section className="mt-7 grid gap-6 md:grid-cols-2">
        <div><h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Poslední práce</h2><div className="grid gap-2">{view.workEntries.slice(0, 12).map((entry) => <WorkEntryRow key={entry.id} entry={entry} />)}{view.workEntries.length === 0 && <p className="text-sm text-neutral-500">Zatím nic zapsáno.</p>}</div></div>
        <div><h2 className="mb-2 text-lg font-semibold text-begina-primary-900">Poslední pohyby a výplaty</h2><div className="grid gap-2">{view.movements.slice(0, 8).map((movement) => <div key={movement.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"><div className="flex justify-between"><span>{movement.kind === "sale" ? "Prodej" : "Naskladnění"}</span><strong>{movement.quantity} ks</strong></div><p className="mt-1 text-xs text-neutral-500">{date.format(movement.occurredAt)}{movement.commissionKc ? ` · provize ${kc.format(movement.commissionKc)}` : ""}</p></div>)}{view.payouts.slice(0, 4).map((payout) => <div key={payout.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><div className="flex justify-between"><span>Vyplaceno</span><strong>{kc.format(payout.amountKc)}</strong></div><p className="mt-1 text-xs text-neutral-500">{date.format(payout.paidAt)}</p></div>)}{view.movements.length === 0 && view.payouts.length === 0 && <p className="text-sm text-neutral-500">Zatím žádný pohyb.</p>}</div></div>
      </section>
    </div>
  </main>;
}

