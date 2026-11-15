import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canViewJardaRewards, getJardaRewardsView } from "@/lib/data/jardaRewards";
import { pragueDateLabel } from "@/lib/data/callHistoryValidation";
import { formatKc } from "@/lib/format";
import PayoutForm from "./PayoutForm";

export const dynamic = "force-dynamic";

const leadHref = (id: string) => `/rizeni-firmy/obchod/leady/${id}?zpet=prace`;

// Jardova karta (audit 15. 11. 2026): jeho zákazníci (Jardův hovor
// v MojeBegina před první objednávkou), zaplacené zboží, odměny a výplaty.
export default async function JardaOdmenyPage() {
  const ctx = await getAuthContext();
  if (!canViewJardaRewards(ctx)) redirect("/prace");
  const view = await getJardaRewardsView();
  const { summary } = view;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/prace" className="text-sm text-neutral-500 min-h-8">← Moje práce</Link>

      <div>
        <h1 className="text-xl font-medium text-begina-primary-900">{view.isManager ? "Jarda – zákazníci a odměny" : "Moji zákazníci a odměny"}</h1>
        <p className="text-sm text-neutral-500">
          Zákazník se počítá, když u kontaktu je v MojeBegina zapsaný Jardův hovor před první objednávkou.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Zákazníků" value={String(summary.customerCount)} />
        <Stat label="Zaplacené zboží" value={formatKc(summary.paidGoodsKc)} hint="bez dopravy, po slevách" />
        <Stat label="Odměna" value={summary.rewards.termsAvailable && summary.rewards.totalKc !== null ? formatKc(summary.rewards.totalKc) : "—"} hint={summary.rewards.termsAvailable ? summary.rewards.termsSource ?? undefined : "doplní se podle smlouvy"} />
        <Stat label="Vyplaceno" value={formatKc(summary.paidOutKc)} hint={summary.remainingKc === null ? undefined : `zbývá ${formatKc(summary.remainingKc)}`} />
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-begina-primary-900">Zákazníci ({view.customers.length})</h2>
        {view.customers.length === 0 && <p className="text-sm text-neutral-500">Zatím žádný zákazník podle pravidla.</p>}
        {view.customers.map((c) => (
          <article key={c.leadId} className="rounded-xl border border-emerald-200 bg-white px-4 py-3">
            <Link href={leadHref(c.leadId)} className="block">
              <h3 className="text-base font-medium text-begina-primary-900">{c.displayName}</h3>
              <p className="text-xs text-neutral-500">
                Jardův hovor {pragueDateLabel(c.firstJardaCallAt)} · první objednávka {pragueDateLabel(c.firstOrderAt)}
              </p>
            </Link>
            <ul className="mt-2 flex flex-col gap-1">
              {c.orders.map((o) => (
                <li key={o.id} className="flex justify-between text-sm text-begina-primary-900">
                  <span>
                    {o.orderNumber ? `Obj. ${o.orderNumber}` : "Objednávka"} · {pragueDateLabel(o.orderedAt)}
                    {!o.paid && <span className="ml-1 text-xs text-orange-700">nezaplaceno</span>}
                  </span>
                  <span className="tabular-nums">{formatKc(o.goodsKc)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-right text-sm font-medium text-begina-primary-900">Zaplaceno: {formatKc(c.paidGoodsKc)}</p>
          </article>
        ))}
      </section>

      {view.isManager && view.excluded.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Nezapočítáno – bez Jardova hovoru před první objednávkou ({view.excluded.length})</h2>
          {view.excluded.map((e) => (
            <Link key={e.leadId} href={leadHref(e.leadId)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700 flex justify-between">
              <span>
                {e.displayName}
                <span className="block text-xs text-neutral-500">
                  první objednávka {pragueDateLabel(e.firstOrderAt)} · {e.firstJardaCallAt ? `Jardův hovor až ${pragueDateLabel(e.firstJardaCallAt)}` : "žádný Jardův hovor"}
                </span>
              </span>
              <span className="tabular-nums">{formatKc(e.paidGoodsKc)}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-begina-primary-900">Výplaty ({view.payouts.length})</h2>
        {view.payouts.length === 0 && <p className="text-sm text-neutral-500">Zatím žádná výplata.</p>}
        {view.payouts.map((p) => (
          <div key={p.id} className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 flex justify-between text-sm">
            <span>
              {pragueDateLabel(p.paidAt)}
              {p.note && <span className="block text-xs text-neutral-500">{p.note}</span>}
            </span>
            <span className="tabular-nums font-medium">{formatKc(p.amountKc)}</span>
          </div>
        ))}
        {view.isManager && <PayoutForm />}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-lg font-medium text-begina-primary-900 tabular-nums">{value}</dd>
      {hint && <p className="text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
