import LeadStageBadge from "../LeadStageBadge";
import type { QueueItemCardData } from "@/lib/data/dailyCalls";

// Security Phase 19 (Denní volání 1.0) — sdílená karta kontaktu, stejné
// minimum jako schválené zadání: jméno, klikací telefon, stav, poslední
// poznámka, pořadí. `children` je akční slot (kurátorské ovládání a/nebo
// zápis výsledku) — liší se podle toho, kdo kartu vidí.
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

      {item.lastNote && (
        <p className="text-xs text-neutral-500 line-clamp-2">Poslední poznámka: {item.lastNote}</p>
      )}

      {children}
    </div>
  );
}
