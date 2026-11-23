import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canViewJardaRewards, getJardaRewardsView } from "@/lib/data/jardaRewards";
import { CONTRACT, EXCLUSION_LABEL, REWARD_TYPE_LABEL } from "@/lib/data/jardaRewardsValidation";
import { pragueDateLabel } from "@/lib/data/callHistoryValidation";
import PayoutForm from "./PayoutForm";
import { cancelTrustEntryAction, confirmProposalAction, rejectProposalAction } from "./actions";
import { canViewJardaTrust, getJardaTrustView } from "@/lib/data/jardaTrust";
import { addMonths } from "@/lib/data/trustValidation";
import { RecurringForm, TrustEntryForm } from "./TrustForms";

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
  const trust = canViewJardaTrust(ctx) ? await getJardaTrustView() : null;
  const view = await getJardaRewardsView();
  const { summary } = view;

  return (
    <div className="flex flex-col gap-5">
      {view.isManager ? (
        <Link href="/rizeni-firmy/obchod" className="text-sm text-neutral-500 min-h-8">← Obchod / CRM</Link>
      ) : (
        <Link href="/prace" className="text-sm text-neutral-500 min-h-8">← Moje práce</Link>
      )}

      <div>
        <h1 className="text-xl font-medium text-begina-primary-900">{view.isManager ? "Jarda Blahout – zákazníci a odměny" : "Moji zákazníci a odměny"}</h1>
        <p className="text-sm text-neutral-500">Podle dokumentu „{CONTRACT.title}“. Základ je zaplacené zboží po slevách, bez dopravy.</p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Zákazníků" value={String(summary.customerCount)} />
        <Stat label="Objem (zboží bez dopravy)" value={kc(summary.volumeKc)} />
        <Stat label="Odměna celkem" value={kc(summary.earnedKc)} />
        <Stat label="Zaplaceno (podle jeho faktur)" value={kc(summary.paidOutKc)} />
        <Stat label="Zbývá vyplatit" value={kc(summary.remainingKc)} />
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-begina-primary-900">Vyúčtování po měsících</h2>
        {view.statements.length === 0 && <p className="text-sm text-neutral-500">Zatím žádná odměna.</p>}
        {view.statements.map((m) => (
          <details key={m.month} className="rounded-xl border border-neutral-200 bg-white px-4 py-3" open>
            <summary className="flex justify-between cursor-pointer text-sm font-medium text-begina-primary-900">
              <span className="capitalize">{monthLabel(m.month)}</span>
              <span className="tabular-nums">{kc(m.totalKc)}</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {m.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm text-neutral-700">
                  <span className="min-w-0">
                    {l.customer} · {l.orderNumber ? (l.orderNumber.startsWith("fakt.") ? l.orderNumber : `obj. ${l.orderNumber}`) : "objednávka"}
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

      {view.proposals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">
            {view.isManager ? "Návrhy od Jardy ke schválení" : "Moje návrhy — čekají na potvrzení"} ({view.proposals.length})
          </h2>
          <p className="text-xs text-neutral-500">Sazby určuje dohoda. Odměna se počítá až z typu zákazníka potvrzeného vedením.</p>
          {view.proposals.map((p) => (
            <div key={p.leadId} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm flex flex-col gap-2">
              <Link href={leadHref(p.leadId)} className="flex justify-between gap-2 text-begina-primary-900">
                <span className="font-medium">{p.displayName}</span>
                <span className="text-xs text-neutral-600 shrink-0">navrženo {pragueDateLabel(p.proposedAt)}</span>
              </Link>
              <p className="text-xs text-neutral-700">
                {REWARD_TYPE_LABEL[p.type]}
                {p.upsellProducts.length > 0 ? ` — ${p.upsellProducts.join(", ")}` : ""}
                {p.note ? ` · ${p.note}` : ""}
                {p.hasOrders ? " · už nakoupil" : ""}
              </p>
              {view.isManager && (
                <div className="flex gap-2">
                  <form action={confirmProposalAction.bind(null, p.leadId)}>
                    <button type="submit" className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50">Potvrdit</button>
                  </form>
                  <form action={rejectProposalAction.bind(null, p.leadId)}>
                    <button type="submit" className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700">Zamítnout</button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {view.pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Potvrzení, zatím bez nákupu ({view.pending.length})</h2>
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
        <h2 className="text-sm font-medium text-begina-primary-900">Zaplacené faktury od Jardy ({view.payouts.length})</h2>
        {view.payouts.length === 0 && <p className="text-sm text-neutral-500">Zatím nic nezaplaceno.</p>}
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
      {trust && <TrustSection trust={trust} />}
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

type TrustView = Awaited<ReturnType<typeof getJardaTrustView>>;
const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
};

// Svěřené peníze — soukromé: vidí Jarda, Jaroslav Viner a Lucie; zapisují Viner a Lucie.
function TrustSection({ trust }: { trust: TrustView }) {
  const openPlan = trust.plans.find((p) => p.endMonth === null) ?? null;
  const { forecast } = trust;
  return (
    <section className="flex flex-col gap-3 border-t border-neutral-200 pt-5">
      <div>
        <h2 className="text-base font-medium text-begina-primary-900">Svěřené peníze</h2>
        <p className="text-xs text-neutral-500">Soukromé — vidí jen Jarda, Jaroslav Viner a Lucie.</p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Svěřeno celkem" value={kc(trust.depositedKc)} />
        <Stat label="Zůstatek" value={kc(trust.balanceKc)} />
      </dl>

      {openPlan && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-begina-primary-900 flex flex-col gap-1">
          <p>
            <span className="font-medium">{openPlan.label}:</span> {kc(openPlan.amountKc)} měsíčně, odečítá se automaticky každý {openPlan.dayOfMonth}.
          </p>
          {forecast.nextDue && <p className="text-xs text-neutral-600">Další: {dateLabel(forecast.nextDue.date)} ({kc(forecast.nextDue.amountKc)})</p>}
          <p className="text-xs text-neutral-600">
            {forecast.coveredCount > 0 && forecast.lastCoveredDate
              ? `Zůstatek vystačí na ${forecast.coveredCount} ${forecast.coveredCount === 1 ? "platbu" : forecast.coveredCount < 5 ? "platby" : "plateb"} — poslední ${dateLabel(forecast.lastCoveredDate)}, pak zbude ${kc(forecast.remainderKc)}.`
              : "Zůstatek už nepokryje další platbu."}
          </p>
          {openPlan.note && <p className="text-xs text-neutral-500">{openPlan.note}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-begina-primary-900">Pohyby</h3>
        {trust.lines.length === 0 && <p className="text-sm text-neutral-500">Zatím žádné pohyby.</p>}
        {[...trust.lines].reverse().map((l, i) => (
          <div key={`${l.date}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block text-begina-primary-900">{l.label}</span>
              <span className="block text-xs text-neutral-500">
                {dateLabel(l.date)}
                {l.kind === "recurring" ? " · automaticky" : ""} · zůstatek {kc(l.balanceKc)}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className={`tabular-nums font-medium ${l.amountKc >= 0 ? "text-emerald-700" : "text-begina-primary-900"}`}>
                {l.amountKc >= 0 ? "+" : "−"}
                {kc(Math.abs(l.amountKc))}
              </span>
              {trust.canEdit && l.entryId && (
                <form action={cancelTrustEntryAction.bind(null, l.entryId)}>
                  <button type="submit" className="text-xs text-red-700 underline">Zrušit záznam</button>
                </form>
              )}
            </span>
          </div>
        ))}
      </div>

      {trust.canEdit && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TrustEntryForm today={trust.today} />
          <RecurringForm
            current={openPlan ? { label: openPlan.label, amountKc: openPlan.amountKc, dayOfMonth: openPlan.dayOfMonth } : null}
            defaultMonth={addMonths(trust.today.slice(0, 7), 1)}
          />
        </div>
      )}
    </section>
  );
}
