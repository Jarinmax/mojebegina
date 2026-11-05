import Link from "next/link";
import LeadStageBadge from "../LeadStageBadge";
import type { QueueItemCardData } from "@/lib/data/dailyCalls";

// Security Phase 19 (Denní volání 1.0) — sdílená karta kontaktu, stejné
// minimum jako schválené zadání: jméno, klikací telefon, stav, poslední
// poznámka, pořadí. `children` je akční slot (kurátorské ovládání a/nebo
// zápis výsledku) — liší se podle toho, kdo kartu vidí.
//
// Security Phase 19.3 — odkaz "Otevřít kartu zákazníka / historii" je na
// KAŽDÉ kartě, i u "Nezájem" a u dávno dokončených položek (Nedávno
// obvoláno) — oprávnění k cíli ověřuje server (getDailyCallContactDetail),
// tahle karta jen nabízí cestu dovnitř, nic sama nepropouští. `id={qi-…}`
// je kotva, na kterou se po návratu z detailu (odkaz "Zpět do fronty",
// `?from=item.id`) naviguje `#qi-<id>` — bez klientského JS.
type Props = {
  item: QueueItemCardData;
  orderNumber: number;
  children?: React.ReactNode;
};

export default function QueueItemCard({ item, orderNumber, children }: Props) {
  return (
    <div id={`qi-${item.id}`} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-neutral-400">#{orderNumber}</p>
          <p className="text-sm font-medium text-begina-primary-900">{item.displayName}</p>
        </div>
        <LeadStageBadge stage={item.stage} />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {item.contactPhone && (
          <a
            href={`tel:${item.contactPhone.replace(/\s+/g, "")}`}
            className="text-sm text-begina-primary-700 font-medium"
          >
            {item.contactPhone}
          </a>
        )}
        <Link
          href={`/rizeni-firmy/obchod/dnes/kontakt/${item.leadId}?from=${item.id}`}
          className="text-xs font-medium text-begina-primary-900 underline underline-offset-2"
        >
          Otevřít kartu zákazníka / historii →
        </Link>
      </div>

      {item.lastNote && (
        <p className="text-xs text-neutral-500 line-clamp-2">Poslední poznámka: {item.lastNote}</p>
      )}

      {children}
    </div>
  );
}
