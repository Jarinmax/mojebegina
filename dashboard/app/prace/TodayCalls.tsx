import Link from "next/link";
import type { TodayCall } from "@/lib/data/callHistory";
import { pragueTimeLabel } from "@/lib/data/callHistoryValidation";

// Dnes zavoláno — kontakty, kterým se dnes volalo (poslední hovor nahoře).
// Klepnutí otevře kontakt: historie, telefon a zápis dalšího hovoru.
export default function TodayCalls({ calls, showAuthor, back }: { calls: TodayCall[]; showAuthor: boolean; back: "prace" | "dnes" }) {
  if (calls.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Dnes zavoláno">
      <h2 className="text-sm font-medium text-begina-primary-900">Dnes zavoláno ({calls.length})</h2>
      {calls.map((c) => (
        <article key={c.leadId} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-start justify-between gap-3">
          <Link href={`/rizeni-firmy/obchod/leady/${c.leadId}?zpet=${back}`} className="min-w-0 flex-1 block">
            <p className="text-xs text-emerald-800">
              {pragueTimeLabel(c.createdAt)}
              {c.resultLabel ? ` · ${c.resultLabel}` : ""}
              {showAuthor && c.authorName ? ` · ${c.authorName}` : ""}
            </p>
            <h3 className="text-sm font-medium text-begina-primary-900 truncate">{c.displayName}</h3>
            {c.note && <p className="text-xs text-neutral-600 line-clamp-2">{c.note}</p>}
            <span className="text-xs text-blue-700">Otevřít kontakt ›</span>
          </Link>
          {c.contactPhone && (
            <a href={`tel:${c.contactPhone.replace(/\s+/g, "")}`} aria-label={`Zavolat znovu ${c.displayName}`} className="shrink-0 min-h-11 inline-flex items-center text-sm font-medium text-blue-700">
              📞 {c.contactPhone}
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
