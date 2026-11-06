import Link from "next/link";
import LeadStageBadge from "../LeadStageBadge";
import { formatCzechDate } from "@/lib/format";
import type { QueueItemCardData } from "@/lib/data/dailyCalls";

// Security Phase 19 (Denní volání 1.0) — sdílená karta kontaktu, stejné
// minimum jako schválené zadání: jméno, klikací telefon, stav, poslední
// poznámka, pořadí. `children` je akční slot (kurátorské ovládání a/nebo
// zápis výsledku) — liší se podle toho, kdo kartu vidí.
//
// lastContactedAt (zadání 6. 11. 2026): kdo volá frontu odshora dolů musí
// hned vidět, že tenhle kontakt už byl nedávno obvolaný — jinak se stávalo,
// že se mu volalo znovu bez vědomí, že hovor proběhl před pár dny.
type Props = {
  item: QueueItemCardData;
  orderNumber: number;
  children?: React.ReactNode;
};

export default function QueueItemCard({ item, orderNumber, children }: Props) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-neutral-400">#{orderNumber}</p>
          <p className="text-sm font-medium text-begina-primary-900">{item.displayName}</p>
        </div>
        <LeadStageBadge stage={item.stage} />
      </div>

      {item.contactPhone && (
        <a
          href={`tel:${item.contactPhone.replace(/\s+/g, "")}`}
          className="text-sm text-begina-primary-700 font-medium"
        >
          {item.contactPhone}
        </a>
      )}

      {item.notInterested && (
        <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          Nezájem — Jardovi se nezobrazuje. Odeberte ho z fronty.
        </p>
      )}

      {item.lastContactedAt && (
        <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 self-start">
          Naposledy voláno: {formatCzechDate(item.lastContactedAt)}
        </p>
      )}

      {item.lastNote && (
        <p className="text-xs text-neutral-500 line-clamp-2">Poslední poznámka: {item.lastNote}</p>
      )}

      <Link
        href={`/rizeni-firmy/obchod/leady/${item.leadId}?zpet=dnes`}
        className="text-sm text-blue-700 underline self-start min-h-8 inline-flex items-center"
      >
        Otevřít kontakt a historii ›
      </Link>

      {children}
    </div>
  );
}
