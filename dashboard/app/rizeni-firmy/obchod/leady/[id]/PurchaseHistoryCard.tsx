import type { StoredPurchaseHistory } from "@/lib/data/purchaseHistorySync";
import { formatKc } from "@/lib/format";

// „Co kupoval“ u kontaktu (zadání Lucie 18. 11. 2026): podle faktur v iDokladu,
// obnovuje se každou noc. Obchodník vidí, o čem se zákazníkem mluvit — a co už
// dnes v nabídce není.
const MATCH_LABEL = { email: "e-mailu", phone: "telefonu", name: "jména" } as const;

function day(value: string | null): string {
  if (!value) return "neznámé datum";
  const [y, m, d] = value.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

const quantity = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 }));

export default function PurchaseHistoryCard({ history, lastSync }: { history: StoredPurchaseHistory | null; lastSync: string | null }) {
  if (!history) {
    // dokud noční běh ani jednou neproběhl, nic netvrdíme
    if (!lastSync) return null;
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <p className="text-xs text-neutral-500 mb-0.5">Co kupoval</p>
        <p className="text-sm text-begina-primary-900">V iDokladu žádná faktura — bereme ho jako nového zákazníka.</p>
      </div>
    );
  }
  const current = history.items.filter((i) => i.current !== false);
  const gone = history.items.filter((i) => i.current === false);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
      <div>
        <p className="text-xs text-neutral-500 mb-0.5">Co kupoval</p>
        <p className="text-sm text-begina-primary-900">
          {history.invoices} {history.invoices === 1 ? "faktura" : history.invoices < 5 ? "faktury" : "faktur"} · celkem {formatKc(history.totalKc)} · naposledy {day(history.lastDay)}
        </p>
      </div>
      {current.length > 0 && (
        <ul className="flex flex-col gap-1">
          {current.map((item) => (
            <li key={item.name} className="flex justify-between gap-3 text-sm text-begina-primary-900">
              <span>
                <span className="font-medium">{quantity(item.quantity)}×</span> {item.name}
              </span>
              <span className="flex-none text-xs text-neutral-500">{day(item.lastDay)}</span>
            </li>
          ))}
        </ul>
      )}
      {gone.length > 0 && (
        <div>
          <p className="text-xs text-neutral-500 mb-1">Už neprodáváme — nenabízet</p>
          <ul className="flex flex-col gap-1">
            {gone.map((item) => (
              <li key={item.name} className="flex justify-between gap-3 text-sm text-neutral-500">
                <span>
                  {quantity(item.quantity)}× {item.name}
                </span>
                <span className="flex-none text-xs">{day(item.lastDay)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-neutral-500">Podle faktur v iDokladu, spárováno podle {MATCH_LABEL[history.matchedBy]}. Obnovuje se každou noc.</p>
    </div>
  );
}
