import Link from "next/link";
import type { ScheduledCallItem } from "@/lib/data/leads";
import { formatPragueDateTime } from "@/lib/data/callActivityValidation";

// Moje dnešní naplánované hovory — termín „Další kontakt“ (datum i hodina)
// připadá na dnešek. Přesná upozornění v mobilu posílá Google Kalendář.
export default function ScheduledCalls({ calls }: { calls: ScheduledCallItem[] }) {
  if (calls.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Naplánované hovory dnes">
      <h2 className="text-sm font-medium text-begina-primary-900">Naplánované hovory dnes ({calls.length})</h2>
      {calls.map((c) => (
        <article key={c.leadId} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3">
          <Link href={`/rizeni-firmy/obchod/leady/${c.leadId}?zpet=prace`} className="min-w-0 flex-1 block">
            <p className="text-xs font-medium text-amber-800">v {formatPragueDateTime(c.callAt).slice(11)}</p>
            <h3 className="text-sm font-medium text-begina-primary-900 truncate">{c.displayName}</h3>
          </Link>
          {c.contactPhone && (
            <a
              href={`tel:${c.contactPhone.replace(/\s+/g, "")}`}
              aria-label={`Zavolat ${c.displayName}`}
              className="shrink-0 min-h-11 inline-flex items-center rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50"
            >
              📞 {c.contactPhone}
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
