"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import LeadStageBadge from "../LeadStageBadge";
import ActivityList from "./ActivityList";
import { useDailyCallOutcomeContext } from "./DailyCallOutcomeContext";
import { formatCzechDate, formatCzechDateTime } from "@/lib/format";
import type { QueueItemCardData } from "@/lib/data/dailyCalls";

// Security Phase 19 (Denní volání 1.0) — sdílená karta kontaktu.
//
// Zadání 6. 11. 2026: označení „Nezájem“ (jen kurátor), „Naposledy voláno“
// a odkaz na detail kontaktu s celou historií.
//
// Security Phase 21 (Denní volání 1.1) — rozšířeno o poslední 3 relevantní
// záznamy VŽDY vidět (bez kliknutí — schváleno explicitně, Jarda je
// potřebuje při přípravě na hovor), termín dalšího kontaktu a rozbalení
// pro zbytek historie nad 3 záznamy.
//
// Přístupnost (schváleno explicitně, bod 2 revize): karta je neinteraktivní
// `<article>`. Rozbalení má SKUTEČNÉ `<button aria-expanded aria-controls>`
// pro klávesnici — klik na neinteraktivní plochu karty ho může vyvolat
// taky (`onClick` na `<article>` bez role/tabIndex, nejde o druhý
// interaktivní prvek), ale telefon, tlačítko rozbalení samo a `children`
// (akční formuláře) VŽDY zastaví propagaci, aby klik na ně nerozbaloval/
// nezabaloval kartu navíc.
type Props = {
  item: QueueItemCardData;
  orderNumber: number;
  children?: React.ReactNode;
};

export default function QueueItemCard({ item, orderNumber, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const ctx = useDailyCallOutcomeContext();
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ctx?.registerRef(item.id, ref.current);
    return () => ctx?.registerRef(item.id, null);
  }, [ctx, item.id]);

  const highlighted = ctx?.highlightId === item.id;
  const recent = item.activity.slice(0, 3);
  const older = item.activity.slice(3);

  return (
    <article
      ref={ref as React.RefObject<HTMLElement>}
      onClick={() => setExpanded((v) => !v)}
      className={`bg-white border rounded-xl p-4 flex flex-col gap-2 ${
        highlighted ? "border-begina-primary-700 ring-2 ring-begina-primary-200" : "border-neutral-200"
      }`}
    >
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
          onClick={(e) => e.stopPropagation()}
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

      {item.nextFollowUpAt && (
        <p className="text-xs text-neutral-500">Další kontakt: {formatCzechDateTime(item.nextFollowUpAt)}</p>
      )}

      <div>
        <p className="text-xs text-neutral-400 mb-1">Poslední hovory</p>
        <ActivityList entries={recent} />
      </div>

      {older.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="text-xs font-medium text-begina-primary-700 self-start"
          >
            {expanded ? "Skrýt starší historii" : `Zobrazit celou historii (${item.activity.length})`}
          </button>
          {expanded && (
            <div id={panelId}>
              <ActivityList entries={older} />
            </div>
          )}
        </>
      )}

      <Link
        href={`/rizeni-firmy/obchod/leady/${item.leadId}?zpet=dnes`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm text-blue-700 underline self-start min-h-8 inline-flex items-center"
      >
        Otevřít kontakt a historii ›
      </Link>

      {children && <div onClick={(e) => e.stopPropagation()}>{children}</div>}
    </article>
  );
}
