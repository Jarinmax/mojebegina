import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isDailyCallWorker } from "@/lib/data/dailyCallsAuth";
import { getCallHistory, searchContacts } from "@/lib/data/callHistory";
import {
  CONTACT_SEARCH_LIMIT,
  groupByPragueDay,
  parseContactSearch,
  parsePage,
  pragueDateLabel,
  pragueDayLabel,
  pragueTimeLabel,
} from "@/lib/data/callHistoryValidation";
import LeadStageBadge from "@/app/rizeni-firmy/obchod/LeadStageBadge";

export const dynamic = "force-dynamic";

const leadHref = (id: string) => `/rizeni-firmy/obchod/leady/${id}?zpet=hovory`;
const telHref = (phone: string) => `tel:${phone.replace(/\s+/g, "")}`;

// Hovory a kontakty — historie uložených hovorů (nejnovější nahoře, po
// dnech) a hledání v celé databázi kontaktů. Klepnutí otevře detail
// kontaktu, kde je celá historie a kde jde zapsat další hovor.
export default async function HovoryPage(props: PageProps<"/prace/hovory">) {
  const ctx = await getAuthContext();
  if (!isDailyCallWorker(ctx)) redirect("/prace");

  const params = await props.searchParams;
  const search = parseContactSearch(params.q);
  const page = parsePage(params.strana);

  const [history, results] = await Promise.all([
    search ? null : getCallHistory(page),
    search ? searchContacts(search) : null,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/prace" className="text-sm text-neutral-500 min-h-8">← Moje práce</Link>

      <div>
        <h1 className="text-xl font-medium text-begina-primary-900">Hovory a kontakty</h1>
        <p className="text-sm text-neutral-500">Klepnutím otevřete kontakt: historie, telefon a zápis dalšího hovoru.</p>
      </div>

      <form action="/prace/hovory" method="get" role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={search?.text ?? ""}
          placeholder="Hledat firmu, jméno, telefon, město…"
          aria-label="Hledat kontakt"
          enterKeyHint="search"
          className="min-h-11 flex-1 min-w-0 rounded-lg border border-neutral-300 bg-white px-3 text-base"
        />
        <button type="submit" className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50">
          Hledat
        </button>
      </form>

      {results && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-begina-primary-900">
              Nalezené kontakty ({results.length === CONTACT_SEARCH_LIMIT ? `prvních ${CONTACT_SEARCH_LIMIT}` : results.length})
            </h2>
            <Link href="/prace/hovory" className="text-sm text-blue-700 underline">Zpět na historii</Link>
          </div>
          {results.length === 0 && <p className="text-sm text-neutral-500">Nic nenalezeno.</p>}
          {results.map((c) => (
            <article key={c.id} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 flex items-start justify-between gap-3">
              <Link href={leadHref(c.id)} className="min-w-0 flex-1 block">
                <h3 className="text-base font-medium text-begina-primary-900 truncate">{c.displayName}</h3>
                {(c.contactName || c.city) && (
                  <p className="text-sm text-neutral-600 truncate">{[c.contactName, c.city].filter(Boolean).join(" · ")}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <LeadStageBadge stage={c.stage} />
                  <span>{c.lastCallAt ? `Naposledy voláno ${pragueDateLabel(c.lastCallAt)}` : "Zatím nevoláno"}</span>
                  {c.nextFollowUpAt && <span>· Další kontakt {pragueDateLabel(c.nextFollowUpAt)}</span>}
                </div>
                <span className="text-xs text-blue-700 mt-1 inline-block">Otevřít kontakt ›</span>
              </Link>
              {c.contactPhone && (
                <a href={telHref(c.contactPhone)} className="shrink-0 min-h-11 inline-flex items-center text-sm font-medium text-blue-700">
                  📞 {c.contactPhone}
                </a>
              )}
            </article>
          ))}
        </section>
      )}

      {history && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-begina-primary-900">
            {history.allAuthors ? "Historie hovorů (všichni)" : "Moje hovory"}
          </h2>
          {history.entries.length === 0 && <p className="text-sm text-neutral-500">Zatím žádný uložený hovor.</p>}
          {groupByPragueDay(history.entries).map((group) => (
            <div key={group.day} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {pragueDayLabel(group.day)} · {group.items.length} {group.items.length === 1 ? "hovor" : group.items.length < 5 ? "hovory" : "hovorů"}
              </h3>
              {group.items.map((e) => (
                <article key={e.id} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 flex items-start justify-between gap-3">
                  <Link href={leadHref(e.leadId)} className="min-w-0 flex-1 block">
                    <p className="text-xs text-neutral-500">
                      {pragueTimeLabel(e.createdAt)}
                      {history.allAuthors && e.authorName ? ` · ${e.authorName}` : ""}
                    </p>
                    <h4 className="text-base font-medium text-begina-primary-900 truncate">{e.displayName}</h4>
                    {(e.resultLabel || e.stageLabel) && (
                      <p className="text-sm text-begina-primary-900">
                        {[e.resultLabel, e.stageLabel ? `fáze „${e.stageLabel}“` : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {e.note && <p className="text-sm text-neutral-600 whitespace-pre-wrap line-clamp-3 mt-0.5">{e.note}</p>}
                    <span className="text-xs text-blue-700 mt-1 inline-block">Otevřít kontakt ›</span>
                  </Link>
                  {e.contactPhone && (
                    <a href={telHref(e.contactPhone)} aria-label={`Zavolat ${e.displayName}`} className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-lg">
                      📞
                    </a>
                  )}
                </article>
              ))}
            </div>
          ))}
          <nav className="flex justify-between text-sm">
            {history.page > 0 ? (
              <Link href={history.page === 1 ? "/prace/hovory" : `/prace/hovory?strana=${history.page - 1}`} className="min-h-11 inline-flex items-center text-blue-700 underline">
                ← Novější
              </Link>
            ) : <span />}
            {history.hasMore && (
              <Link href={`/prace/hovory?strana=${history.page + 1}`} className="min-h-11 inline-flex items-center text-blue-700 underline">
                Starší hovory →
              </Link>
            )}
          </nav>
        </section>
      )}
    </div>
  );
}
