import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { CHECK_GROUPS, LOG_ACTION_LABELS, findCheck, findingStates, summarizeFindings, type Finding, type FindingState, type LogEntry } from "@/lib/finance-kontroly/checks";
import { financeLogTableExists, loadCheckLog, runDatabaseChecks } from "@/lib/finance-kontroly/server";
import { recordFindingAction, recordRunAction, runIdokladAction } from "../actions";
import { BASE, LEVEL_LABELS, LEVEL_STYLES, folderHref, formatPragueDateTime, parseYear, pragueToday } from "../shared";

// FINANCE – KONTROLY A AUDIT 1.0 — jedna složka = jedna kontrola: nálezy,
// zápis výsledku prověření a deník této kontroly. Jen Jaroslav a Lucie.
export const dynamic = "force-dynamic";

type RunSnapshot = { year?: number; checkedOn?: string; findings?: Finding[]; truncated?: boolean; unpaidFrom?: string; scanned?: number };

function FindingForm({ checkKey, year, finding, logReady }: { checkKey: string; year: number; finding: Finding; logReady: boolean }) {
  if (!logReady) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-begina-primary-900">Zapsat výsledek prověření</summary>
      <form action={recordFindingAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="checkKey" value={checkKey} />
        <input type="hidden" name="rok" value={year} />
        <input type="hidden" name="findingKey" value={finding.key} />
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="action" value="ok" defaultChecked /> Prověřeno – v pořádku
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="action" value="fixed" /> Opraveno
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="action" value="note" /> Jen poznámka
          </label>
        </div>
        <textarea name="note" rows={2} maxLength={2000} placeholder="Co jste zjistili, kde je doklad, co se opravilo…" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <div>
          <button type="submit" className="rounded-lg bg-begina-primary-900 px-3 py-1.5 text-sm font-medium text-white">
            Uložit do deníku
          </button>
        </div>
      </form>
    </details>
  );
}

function FindingItem({ finding, state, notes, form }: { finding: Finding; state: FindingState | undefined; notes: LogEntry[]; form: React.ReactNode }) {
  return (
    <li className="bg-white border border-neutral-200 rounded-xl p-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLES[finding.level]}`}>{LEVEL_LABELS[finding.level]}</span>
        <p className="min-w-0 flex-1 text-sm">{finding.message}</p>
        {finding.href && (
          <Link href={finding.href} className="shrink-0 text-xs font-medium text-begina-primary-900 underline">
            Otevřít
          </Link>
        )}
      </div>
      {state === "fixed_still_present" && <p className="mt-2 text-xs text-red-700">Označeno jako opravené, ale kontrola nález pořád vidí — oprava se neprojevila.</p>}
      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2">
          {notes.map((entry) => (
            <li key={entry.id} className="text-xs text-neutral-600">
              <span className="font-medium text-neutral-800">{LOG_ACTION_LABELS[entry.action]}</span> · {formatPragueDateTime(entry.createdAt)} · {entry.authorName ?? "—"}
              {entry.note ? ` — ${entry.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      {form}
    </li>
  );
}

export default async function FinanceCheckPage(props: PageProps<"/rizeni-firmy/finance/[kontrola]">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const { kontrola } = await props.params;
  const check = findCheck(kontrola);
  if (!check) notFound();

  const searchParams = await props.searchParams;
  const { year: currentYear, today } = pragueToday();
  const year = parseYear(searchParams.rok, currentYear);
  const error = typeof searchParams.chyba === "string" ? searchParams.chyba : null;
  const saved = searchParams.ulozeno === "1";

  const logReady = await financeLogTableExists();
  const log = logReady ? await loadCheckLog(check.key) : [];
  const runs = log.filter((entry) => entry.action === "run");

  let findings: Finding[] = [];
  let unavailable: string | null = null;
  let idokladRun: (LogEntry & { snapshot: RunSnapshot }) | null = null;
  if (check.onDemand) {
    idokladRun = (runs.find((entry) => (entry.snapshot as RunSnapshot | null)?.year === year) as (LogEntry & { snapshot: RunSnapshot }) | undefined) ?? null;
    findings = idokladRun?.snapshot.findings ?? [];
  } else {
    const run = (await runDatabaseChecks(year, today)).find((item) => item.key === check.key);
    if (!run || !run.available) unavailable = run?.error ?? "Kontrolu se nepodařilo provést.";
    else findings = run.findings;
  }

  const states = findingStates(findings, log);
  const summary = summarizeFindings(findings, states);
  const notesFor = (key: string) => log.filter((entry) => entry.findingKey === key).reverse();
  const open = findings.filter((finding) => states.get(finding.key) !== "ok");
  const resolved = findings.filter((finding) => states.get(finding.key) === "ok");
  const group = CHECK_GROUPS.find((item) => item.key === check.group);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div>
        <p className="text-sm">
          <Link href={`${BASE}?rok=${year}`} className="text-begina-primary-900 underline">
            Finance – kontroly a audit
          </Link>{" "}
          / {group?.title}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">
              {check.title} {year}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">{check.description}</p>
          </div>
          <p className="text-sm flex gap-4">
            <Link className="underline" href={folderHref(check.key, year - 1)}>
              ← {year - 1}
            </Link>
            <Link className="underline" href={folderHref(check.key, year + 1)}>
              {year + 1} →
            </Link>
          </p>
        </div>
      </div>

      {error && <p className="text-sm rounded-lg bg-red-50 text-red-800 px-3 py-2">{error}</p>}
      {saved && <p className="text-sm rounded-lg bg-green-50 text-green-800 px-3 py-2">Zapsáno do deníku.</p>}
      {!logReady && (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">
          Deník kontrol v databázi ještě není — nálezy se ukazují, ale zápisy půjdou až po spuštění skriptu 123_finance_kontroly_MAIN v Neonu.
        </p>
      )}

      {check.onDemand ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm text-neutral-700">
            {idokladRun
              ? `Naposledy spuštěno ${formatPragueDateTime(idokladRun.createdAt)} (${idokladRun.authorName ?? "—"}). Neuhrazené faktury od ${idokladRun.snapshot.unpaidFrom ?? "—"}, prošlo ${idokladRun.snapshot.scanned ?? 0} faktur${idokladRun.snapshot.truncated ? " — výsledek je oříznutý" : ""}.`
              : `Za rok ${year} kontrola iDokladu ještě neproběhla.`}
          </p>
          {logReady && (
            <form action={runIdokladAction} className="flex flex-col gap-2">
              <input type="hidden" name="checkKey" value={check.key} />
              <input type="hidden" name="rok" value={year} />
              <input name="note" maxLength={2000} placeholder="Poznámka k zápisu (nepovinné)" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <div>
                <button type="submit" className="rounded-lg bg-begina-primary-900 px-3 py-1.5 text-sm font-medium text-white">
                  Spustit kontrolu iDokladu a zapsat
                </button>
              </div>
              <p className="text-xs text-neutral-500">Jen čtení. Spotřebuje několik desítek dotazů z denní kvóty iDokladu, proto se nespouští sama.</p>
            </form>
          )}
        </div>
      ) : unavailable ? (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Kontrola je nedostupná: {unavailable} (to neznamená, že je vše v pořádku).</p>
      ) : null}

      {!unavailable && (check.onDemand ? idokladRun : true) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Chyby", summary.errors, "text-red-700"],
            ["K prověření", summary.warnings, "text-amber-800"],
            ["K ověření", summary.infos, "text-sky-800"],
            ["Vyřízeno", summary.resolved, "text-green-800"],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="bg-white border border-neutral-200 rounded-xl p-3">
              <p className="text-xs text-neutral-500">{label}</p>
              <p className={`mt-1 text-xl font-semibold ${value ? tone : "text-neutral-400"}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {!unavailable && (check.onDemand ? idokladRun : true) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Otevřené nálezy ({open.length})</h2>
          {open.length === 0 ? (
            <p className="text-sm text-neutral-600">Kontrola nenašla nic otevřeného.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((finding) => (
                <FindingItem key={finding.key} finding={finding} state={states.get(finding.key)} notes={notesFor(finding.key)} form={<FindingForm checkKey={check.key} year={year} finding={finding} logReady={logReady} />} />
              ))}
            </ul>
          )}
          {resolved.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-begina-primary-900">Vyřízené – prověřeno a v pořádku ({resolved.length})</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {resolved.map((finding) => (
                  <FindingItem key={finding.key} finding={finding} state={states.get(finding.key)} notes={notesFor(finding.key)} form={<FindingForm checkKey={check.key} year={year} finding={finding} logReady={logReady} />} />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {logReady && !check.onDemand && !unavailable && (
        <section className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
          <h2 className="text-base font-semibold">Zápis o provedení kontroly</h2>
          <p className="text-sm text-neutral-600">Uloží do deníku, že jste kontrolu za rok {year} prošli, s aktuálním stavem nálezů (kolik bylo chyb, co je vyřízené).</p>
          <form action={recordRunAction} className="flex flex-col gap-2">
            <input type="hidden" name="checkKey" value={check.key} />
            <input type="hidden" name="rok" value={year} />
            <textarea name="note" rows={2} maxLength={2000} placeholder="Závěr kontroly (nepovinné)" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            <div>
              <button type="submit" className="rounded-lg bg-begina-primary-900 px-3 py-1.5 text-sm font-medium text-white">
                Zapsat provedení kontroly
              </button>
            </div>
          </form>
        </section>
      )}

      {logReady && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Deník této kontroly</h2>
          {log.length === 0 ? (
            <p className="text-sm text-neutral-600">Zatím žádný zápis.</p>
          ) : (
            <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="px-3 py-2 font-medium">Kdy</th>
                    <th className="px-3 py-2 font-medium">Kdo</th>
                    <th className="px-3 py-2 font-medium">Zápis</th>
                    <th className="px-3 py-2 font-medium">Poznámka</th>
                  </tr>
                </thead>
                <tbody>
                  {log.slice(0, 200).map((entry) => {
                    const snapshot = entry.action === "run" ? ((entry.snapshot ?? {}) as RunSnapshot & { summary?: { errors: number; warnings: number; infos: number; resolved: number } }) : null;
                    return (
                      <tr key={entry.id} className="border-b border-neutral-100 last:border-0 align-top">
                        <td className="px-3 py-2 whitespace-nowrap">{formatPragueDateTime(entry.createdAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{entry.authorName ?? "—"}</td>
                        <td className="px-3 py-2">
                          {LOG_ACTION_LABELS[entry.action]}
                          {snapshot?.summary &&
                            ` za ${snapshot.year}: ${snapshot.summary.errors} chyb, ${snapshot.summary.warnings} k prověření, ${snapshot.summary.infos} k ověření, ${snapshot.summary.resolved} vyřízeno`}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{entry.note ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
