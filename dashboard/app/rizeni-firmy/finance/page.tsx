import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { CHECKS, CHECK_GROUPS, findingStates, summarizeFindings, type CheckSummary, type Finding } from "@/lib/finance-kontroly/checks";
import { financeLogTableExists, loadCheckLog, loadDecisions, loadLastRuns, runDatabaseChecks } from "@/lib/finance-kontroly/server";
import { BASE, folderHref, formatPragueDateTime, parseYear, pragueToday } from "./shared";

// FINANCE – KONTROLY A AUDIT 1.0 (16. 11. 2026) — přehled složek kontrol.
// Každá kontrola má vlastní složku (/rizeni-firmy/finance/[kontrola]) s nálezy
// a deníkem; všechny zápisy dohromady jsou v Auditním deníku. Přístup JEN
// Jaroslav a Lucie (isInvoiceIssuer); ostatním se stránka tváří, že neexistuje.
export const dynamic = "force-dynamic";

type FolderStatus = { summary: CheckSummary | null; error: string | null; lastRun: string | null };

function StatusLine({ status }: { status: FolderStatus }) {
  if (status.error) return <p className="text-xs text-amber-800">Nedostupné: {status.error}</p>;
  if (!status.summary) return <p className="text-xs text-neutral-500">Ještě nespuštěno — otevřete složku a spusťte.</p>;
  const { errors, warnings, infos, resolved, open } = status.summary;
  if (open === 0) return <p className="text-xs font-medium text-green-800">V pořádku{resolved ? ` · ${resolved} vyřízeno` : ""}</p>;
  return (
    <p className="text-xs flex flex-wrap gap-x-3">
      {errors > 0 && <span className="font-medium text-red-700">{errors} chyb</span>}
      {warnings > 0 && <span className="font-medium text-amber-800">{warnings} k prověření</span>}
      {infos > 0 && <span className="text-sky-800">{infos} k ověření</span>}
      {resolved > 0 && <span className="text-green-800">{resolved} vyřízeno</span>}
    </p>
  );
}

export default async function FinancePage(props: PageProps<"/rizeni-firmy/finance">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  const searchParams = await props.searchParams;
  const { year: currentYear, today } = pragueToday();
  const year = parseYear(searchParams.rok, currentYear);

  const logReady = await financeLogTableExists();
  const [runs, decisions, lastRuns, idokladLog] = await Promise.all([
    runDatabaseChecks(year, today),
    logReady ? loadDecisions() : Promise.resolve([]),
    logReady ? loadLastRuns() : Promise.resolve(new Map<string, string>()),
    logReady ? loadCheckLog("idoklad") : Promise.resolve([]),
  ]);

  const statuses = new Map<string, FolderStatus>();
  for (const run of runs) {
    const log = decisions.filter((entry) => entry.checkKey === run.key);
    statuses.set(run.key, {
      summary: run.available ? summarizeFindings(run.findings, findingStates(run.findings, log)) : null,
      error: run.available ? null : run.error,
      lastRun: lastRuns.get(run.key) ?? null,
    });
  }
  const idokladRun = idokladLog.find((entry) => entry.action === "run" && (entry.snapshot as { year?: number } | null)?.year === year);
  const idokladFindings = ((idokladRun?.snapshot as { findings?: Finding[] } | null)?.findings ?? []) as Finding[];
  statuses.set("idoklad", {
    summary: idokladRun ? summarizeFindings(idokladFindings, findingStates(idokladFindings, idokladLog)) : null,
    error: null,
    lastRun: idokladRun?.createdAt ?? null,
  });

  const total = [...statuses.values()].reduce(
    (sum, status) => ({ errors: sum.errors + (status.summary?.errors ?? 0), warnings: sum.warnings + (status.summary?.warnings ?? 0), unavailable: sum.unavailable + (status.error ? 1 : 0) }),
    { errors: 0, warnings: 0, unavailable: 0 }
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Finance – kontroly a audit {year}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Každá kontrola má vlastní složku s nálezy a zápisy. Kontroly nic neopravují — ukazují, co prověřit. Vidí jen Jaroslav a Lucie.
          </p>
        </div>
        <p className="text-sm flex gap-4">
          <Link className="underline" href={`${BASE}?rok=${year - 1}`}>
            ← {year - 1}
          </Link>
          <Link className="underline" href={`${BASE}?rok=${year + 1}`}>
            {year + 1} →
          </Link>
        </p>
      </div>

      {!logReady && (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">
          Deník kontrol v databázi ještě není. Kontroly fungují, ale zápisy (prověřeno, opraveno, provedení kontroly) půjdou až po spuštění skriptu 123_finance_kontroly_MAIN v Neonu.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Otevřené chyby</p>
          <p className={`mt-1 text-xl font-semibold ${total.errors ? "text-red-700" : "text-green-800"}`}>{total.errors}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">K prověření</p>
          <p className={`mt-1 text-xl font-semibold ${total.warnings ? "text-amber-800" : "text-green-800"}`}>{total.warnings}</p>
        </div>
        <Link href={`${BASE}/denik`} className="bg-white border border-neutral-200 rounded-xl p-4 hover:border-begina-primary-300">
          <p className="text-xs text-neutral-500">Auditní deník</p>
          <p className="mt-1 text-base font-semibold text-begina-primary-900">Všechny zápisy →</p>
        </Link>
      </div>
      {total.unavailable > 0 && <p className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Některé kontroly jsou nedostupné — jejich nula neznamená, že je vše v pořádku.</p>}

      {CHECK_GROUPS.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <div>
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <p className="text-sm text-neutral-600">{group.description}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHECKS.filter((check) => check.group === group.key).map((check) => {
              const status = statuses.get(check.key) ?? { summary: null, error: null, lastRun: null };
              return (
                <Link key={check.key} href={folderHref(check.key, year)} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-1.5 hover:border-begina-primary-300">
                  <p className="font-medium text-begina-primary-900">{check.title} →</p>
                  <p className="text-xs text-neutral-600">{check.description}</p>
                  <StatusLine status={status} />
                  <p className="text-xs text-neutral-500">{status.lastRun ? `Poslední zápis o kontrole: ${formatPragueDateTime(status.lastRun)}` : "Zatím bez zápisu o provedení."}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
