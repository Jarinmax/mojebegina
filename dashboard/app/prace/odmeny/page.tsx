import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canViewJardaRewards, getJardaRewardsView } from "@/lib/data/jardaRewards";
import { CONTRACT, EXCLUSION_LABEL, REWARD_TYPE_LABEL } from "@/lib/data/jardaRewardsValidation";
import { pragueDateLabel } from "@/lib/data/callHistoryValidation";
import PayoutForm from "./PayoutForm";

export const dynamic = "force-dynamic";

const leadHref = (id: string) => `/rizeni-firmy/obchod/leady/${id}?zpet=prace`;
const kc = (n: number) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
};

// Jardova karta: zákazníci a odměny podle Dohody o odměňování prodejce
// ze dne 14. 11. 2026, měsíční vyúčtování a výplaty.
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
        <p className="text-sm text-neutral-500">Podle dokumentu „{CONTRACT.title}“. Základ je zaplacené zboží po slevách, bez dopravy.</p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Zákazníků" value={String(summary.customerCount)} />
        <Stat label="Odměna celkem" value={kc(summary.earnedKc)} />
        <Stat label="Vyplaceno" value={kc(summary.paidOutKc)} />
        <Stat label="Zbývá vyplatit" value={kc(summary.remainingKc)} />
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-begina-primary-900">Vyúčtování po měsících</h2>
        {view.statements.length === 0 && <p className="text-sm text-neutral-500">Zatím žádná odměna.</p>}
        {view.statements.map((m) => (
          <details key={m.month} className="rounded-xl border border-neutral-200 bg-white px-4 py-3" open={m === view.statements[0]}>
            <summary className="flex justify-between cursor-pointer text-sm font-medium text-begina-primary-900">
              <span className="capitalize">{monthLabel(m.month)}</span>
              <span className="tabular-nums">{kc(m.totalKc)}</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {m.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm text-neutral-700">
                  <span className="min-w-0">
                    {l.customer} · {l.orderNumber ? `obj. ${l.orderNumber}` : "objednávka"}
                    <span className="block text-xs text-neutral-500">
                      {l.label}
                      {l.kind === "commission" ? ` ze ${kc(l.baseKc)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{kc(l.amountKc)}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
        <p className="text-xs text-neutral-400">Odměny se vyúčtují měsíčně a vyplácí do 15. dne následujícího měsíce.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-begina-primary-900">Zákazníci ({view.customers.length})</h2>
        {view.customers.length === 0 && <p className="text-sm text-neutral-500">Zatím žádný zákazník s odměnou.</p>}
        {view.customers.map((c) => (
          <article key={c.leadId} className="rounded-xl border border-emerald-200 bg-white px-4 py-3">
            <Link href={leadHref(c.leadId)} className="block">
              <p className="text-xs font-medium text-emerald-800">
                {REWARD_TYPE_LABEL[c.type]}
                {c.basis === "confirmed_at_signing" ? " · potvrzeno při podpisu dohody" : ""}
              </p>
              <h3 className="text-base font-medium text-begina-primary-900">{c.displayName}</h3>
              <p className="text-xs text-neutral-500">
                Osloven {pragueDateLabel(c.approachAt)} · první objednávka {pragueDateLabel(c.startAt)}
                {c.firstPeriodEndsAt && c.type === "new" ? ` · 5 % do ${pragueDateLabel(c.firstPeriodEndsAt)}` : ""}
              </p>
              {c.upsellProducts.length > 0 && <p className="text-xs text-neutral-500">Nový produkt: {c.upsellProducts.join(", ")}</p>}
            </Link>
            {c.bonus.eligible && c.bonus.deadlineAt && (
              <p className="mt-1 text-xs text-neutral-600">
                {c.bonus.reached
                  ? `Bonus ${kc(CONTRACT.bonusKc)} splněn.`
                  : `Bonus ${kc(CONTRACT.bonusKc)}: ${kc(c.bonus.progressKc)} z ${kc(CONTRACT.bonusThresholdKc)} do ${pragueDateLabel(c.bonus.deadlineAt)}.`}
              </p>
            )}
            <p className="mt-1 flex justify-between text-sm text-begina-primary-900">
              <span>Zaplacené zboží {kc(c.paidGoodsKc)}</span>
              <span className="font-medium tabular-nums">Odměna {kc(c.totalKc)}</span>
            </p>
          </article>
        ))}
      </section>

      {view.pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Evidovaní, zatím bez nákupu ({view.pending.length})</h2>
          {view.pending.map((p) => (
            <Link key={p.leadId} href={leadHref(p.leadId)} className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-begina-primary-900 flex justify-between">
              <span>{p.displayName}</span>
              <span className="text-xs text-neutral-500">{REWARD_TYPE_LABEL[p.type]} · od {pragueDateLabel(p.recordedAt)}</span>
            </Link>
          ))}
        </section>
      )}

      {view.isManager && view.excluded.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Nakoupili, ale odměna nenáleží ({view.excluded.length})</h2>
          {view.excluded.map((e) => (
            <Link key={e.leadId} href={leadHref(e.leadId)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700 flex justify-between gap-2">
              <span>
                {e.displayName}
                <span className="block text-xs text-neutral-500">{EXCLUSION_LABEL[e.reason]}</span>
              </span>
              <span className="shrink-0 tabular-nums">{kc(e.paidGoodsKc)}</span>
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
            <span className="tabular-nums font-medium">{kc(p.amountKc)}</span>
          </div>
        ))}
        {view.isManager && <PayoutForm />}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-lg font-medium text-begina-primary-900 tabular-nums">{value}</dd>
    </div>
  );
}
