import Link from "next/link";
import { listOrders, type OrderCardData } from "@/lib/data/orders";
import { formatOrderNumber } from "@/lib/data/orderBuyer";
import { formatKc } from "@/lib/format";
import { DispatchTile } from "../objednavky/DispatchChecks";
import { shortPragueDate } from "../objednavky/dispatchText";
import { FULFILLMENT_LABELS } from "@/lib/data/orderLabels";
import { listAwaitingPaymentOrders, listProductionOrders } from "@/lib/data/productionBoard";
import ProductionSummary from "./ProductionSummary";

// Výroba (Lucie 18. 11. 2026) — „K výrobě“: souhrnná výrobní tabulka
// zaplacených neodeslaných objednávek + karty pro Jarina; „Expedice“:
// u každé objednávky vyrobeno → odesláno → zaplaceno → faktura poslána.
// Zrušené (stornované) objednávky jen pod záložkou „Zrušené“.
// Autorizaci (ADMIN/EXECUTIVE) řeší app/rizeni-firmy/layout.tsx,
// listOrders si ji ověřuje sama.
import { invoiceSentState } from "@/lib/data/invoiceSentState";

export const dynamic = "force-dynamic";

const PRODUCED = new Set(["ready", "out_for_delivery", "handed_to_carrier", "delivered"]);
const SENT_BY_STATUS = new Set(["handed_to_carrier", "delivered"]);

type Steps = { produced: boolean; shipped: boolean; paid: boolean; invoiceSent: boolean };

function steps(o: OrderCardData): Steps {
  const shipped = Boolean(o.shippedAt) || SENT_BY_STATUS.has(o.fulfillmentStatus);
  return {
    produced: PRODUCED.has(o.fulfillmentStatus),
    shipped,
    paid: o.paymentStatus === "paid",
    invoiceSent: invoiceSentState({ ...o, shipped }).done,
  };
}

const allDone = (s: Steps) => s.produced && s.shipped && s.paid && s.invoiceSent;

const TABS = [
  { key: "k-vyrobe", label: "K výrobě" },
  { key: "k-vyrizeni", label: "Expedice" },
  { key: "hotove", label: "Hotové" },
  { key: "zrusene", label: "Zrušené" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function StaticTile({ done, title, note }: { done: boolean; title: string; note: string }) {
  return (
    <div
      className={`rounded-xl border-2 p-2 text-center min-h-[72px] flex flex-col items-center justify-center gap-1 ${
        done ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-dashed border-neutral-300 text-neutral-600"
      }`}
    >
      <span className="text-sm font-medium">{done ? `✓ ${title}` : title}</span>
      <span className="text-[11px] leading-tight">{note}</span>
    </div>
  );
}

export default async function VyrobaPage(props: PageProps<"/rizeni-firmy/vyroba">) {
  const searchParams = await props.searchParams;
  const tabParam = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "k-vyrobe";

  const [{ orders }, production, awaiting] = await Promise.all([listOrders(), listProductionOrders(), listAwaitingPaymentOrders()]);
  const active = orders.filter((o) => o.fulfillmentStatus !== "cancelled");
  const groups: Record<Exclude<TabKey, "k-vyrobe">, OrderCardData[]> = {
    "k-vyrizeni": active.filter((o) => !allDone(steps(o))),
    hotove: active.filter((o) => allDone(steps(o))),
    zrusene: orders.filter((o) => o.fulfillmentStatus === "cancelled"),
  };
  const visible = tab === "k-vyrobe" ? [] : groups[tab];
  const tabCount = (key: TabKey) => (key === "k-vyrobe" ? production.length : groups[key].length);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mt-1 mb-3">
        <h1 className="text-lg font-medium text-begina-primary-900">Výroba</h1>
        <Link href="/rizeni-firmy/vyroba/sarze" className="rounded-full bg-begina-primary-900 text-white text-sm px-4 py-2">
          ＋ Nová šarže
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "k-vyrobe" ? "/rizeni-firmy/vyroba" : `/rizeni-firmy/vyroba?tab=${t.key}`}
            className={`text-sm rounded-full border px-4 py-2 ${
              tab === t.key
                ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900"
                : "bg-white text-begina-primary-900 border-neutral-300"
            }`}
          >
            {t.label} ({tabCount(t.key)})
          </Link>
        ))}
      </div>

      {tab === "k-vyrobe" ? (
        <ProductionSummary orders={production} awaiting={awaiting} />
      ) : visible.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          {tab === "k-vyrizeni" ? "Vše vyřízeno — nic nečeká." : "Tady zatím nic není."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((o) => {
            const s = steps(o);
            const cancelled = o.fulfillmentStatus === "cancelled";
            return (
              <div key={o.id} className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 min-w-0">
                <Link href={`/rizeni-firmy/objednavky/${o.id}`} className="block min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-begina-primary-900 min-w-0 break-words">
                      {o.orderNumber !== null && (
                        <span className="text-neutral-500 font-normal mr-1.5">{formatOrderNumber(o.orderNumber)}</span>
                      )}
                      {o.buyerOrganizationName}
                    </p>
                    <p className="text-sm font-medium text-begina-primary-900 whitespace-nowrap">{formatKc(o.totalKc)}</p>
                  </div>
                  {o.itemsSummary && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{o.itemsSummary}</p>}
                </Link>

                {cancelled ? (
                  <p className="text-xs text-neutral-500 mt-2">Zrušená objednávka</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <StaticTile
                      done={s.produced}
                      title="Vyrobeno"
                      note={s.produced ? FULFILLMENT_LABELS[o.fulfillmentStatus] : `čeká · ${FULFILLMENT_LABELS[o.fulfillmentStatus]}`}
                    />
                    {o.shippedAt || !s.shipped ? (
                      <DispatchTile
                        orderId={o.id}
                        kind="ship"
                        done={Boolean(o.shippedAt)}
                        doneNote={o.shippedAt ? [shortPragueDate(o.shippedAt), o.carrier].filter(Boolean).join(" · ") : null}
                      />
                    ) : (
                      <StaticTile done title="Odesláno" note={FULFILLMENT_LABELS[o.fulfillmentStatus]} />
                    )}
                    <StaticTile done={s.paid} title="Zaplaceno" note={s.paid ? "ano" : o.paymentOverdue ? "po splatnosti" : "nezaplaceno"} />
                    {(() => {
                      // 22. 11. 2026 (Lucie): faktura se nezaškrtává ručně —
                      // odchází sama s „Odesláno“; starší objednávky už poslané mimo systém.
                      const inv = invoiceSentState({ ...o, shipped: s.shipped });
                      if (inv.done && inv.legacy) {
                        return <StaticTile done title="Faktura poslána" note="před 19. 11. mimo MojeBegina" />;
                      }
                      if (!inv.done && inv.reason === "waits_for_shipping") {
                        return <StaticTile done={false} title="Faktura" note="odejde sama s „Odesláno“" />;
                      }
                      return (
                        <DispatchTile
                          orderId={o.id}
                          kind="invoice"
                          done={inv.done}
                          doneNote={o.invoiceSentAt ? `${shortPragueDate(o.invoiceSentAt)} · ${o.invoiceSentMethod === "email" ? "e-mailem" : "ručně"}` : null}
                          warning={!inv.done ? "neodešla — zkontroluj fakturu" : null}
                        />
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
