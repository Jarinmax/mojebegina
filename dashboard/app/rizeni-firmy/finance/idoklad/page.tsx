import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/data/authContext";
import { isFinanceManager } from "@/lib/data/financeAuth";
import { verifySignedPayload } from "@/lib/finance/idoklad/oauth";
import { resolveIdokladOAuthConfig } from "@/lib/finance/oauthConfig";
import { IDOKLAD_RESULT_COOKIE, IDOKLAD_SEQUENCES_COOKIE } from "@/lib/finance/oauthCookies";
import {
  sequenceDocumentTypeLabel,
  unpackSequences,
  type NumericSequenceRow,
  type ReadOnlyCheckFailure,
  type ReadOnlyCheckResult,
  type SequenceTuple,
} from "@/lib/finance/readOnlyCheck";

export const dynamic = "force-dynamic";

// Finance 1.0 — stránka prvního OAuth testu iDokladu (jen Preview, jen
// Jaroslav Viner). Ukazuje stav konfigurace, tlačítko pro přihlášení
// a výsledek read-only kontroly z krátkodobé podepsané cookie. Nic se
// neukládá do DB; v iDokladu se nic nemění.

const VAT_LABELS: Record<string, string> = {
  non_payer: "neplátce DPH",
  payer: "plátce DPH",
  identified_person: "identifikovaná osoba",
};

const PRAGUE_DATETIME = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function YesNo({ value, yes, no, unknown }: { value: boolean | null; yes: string; no: string; unknown: string }) {
  if (value === null) return <span className="text-neutral-500">{unknown}</span>;
  return value ? <span className="text-green-700">{yes}</span> : <span className="text-red-700">{no}</span>;
}

export default async function IdokladTestPage() {
  const ctx = await getAuthContext();
  if (!isFinanceManager(ctx)) {
    redirect("/rizeni-firmy");
  }

  const config = resolveIdokladOAuthConfig(process.env);
  let result: ReadOnlyCheckResult | ReadOnlyCheckFailure | null = null;
  // undefined = výpis řad v cookie chybí (starší výsledek) → „spusťte test znovu“
  let sequences: NumericSequenceRow[] | null | undefined = undefined;
  let sequencesError: string | null = null;
  if (config.ok) {
    const cookieStore = await cookies();
    const stored = verifySignedPayload<{ v: number; u: string; r: ReadOnlyCheckResult | ReadOnlyCheckFailure }>(
      cookieStore.get(IDOKLAD_RESULT_COOKIE)?.value,
      config.stateSecret
    );
    if (stored && stored.v === 1 && stored.u === ctx!.userId) {
      result = stored.r;
    }
    const storedSequences = verifySignedPayload<{ v: number; u: string; s: SequenceTuple[] | null; e: string | null }>(
      cookieStore.get(IDOKLAD_SEQUENCES_COOKIE)?.value,
      config.stateSecret
    );
    if (storedSequences && storedSequences.v === 1 && storedSequences.u === ctx!.userId) {
      sequences = storedSequences.s ? unpackSequences(storedSequences.s) : null;
      sequencesError = storedSequences.e;
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-medium text-begina-primary-900">iDoklad — test připojení</h1>
      <p className="text-sm text-neutral-500 mt-0.5">
        Přihlášení aplikace MojeBegina k iDokladu (API v3) a ověření účtu jen pro čtení
      </p>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mt-4 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900 mb-1">Co test udělá</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Přesměruje na přihlášení do iDokladu a po návratu přečte název agendy, IČO, režim DPH a tarif.</li>
          <li>U dokladů zjistí jen jejich počet — obsah dokladů se nečte do výsledku ani neukládá.</li>
          <li>Vypíše číselné řady (ID, název, formát, typ dokladu, výchozí) — jen pro čtení, žádnou řadu nezakládá ani nemění.</li>
          <li>Do iDokladu nic nezapisuje a nic nevystavuje. Přístupový token se po kontrole zahodí, refresh token se nežádá.</li>
          <li>Do databáze MojeBegina se nic neukládá. Production se netýká.</li>
        </ul>
      </div>

      {!config.ok ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4 text-sm text-amber-900">
          <p className="font-medium">Připojení není připravené</p>
          <p className="mt-1">{config.reason}</p>
          {config.missing.length > 0 && (
            <ul className="list-disc pl-5 mt-2 font-mono text-xs">
              {config.missing.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {/* Obyčejný odkaz (ne next/link) — žádný prefetch přihlašovací route. */}
          <a
            href="/api/idoklad/connect"
            className="inline-block rounded-lg bg-begina-primary-900 text-white text-sm px-4 py-2 hover:opacity-90"
          >
            Připojit iDoklad (jen čtení)
          </a>
        </div>
      )}

      {result && !result.ok && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4 text-sm text-red-900">
          <p className="font-medium">Ověření se nepodařilo</p>
          <p className="mt-1">{result.message}</p>
          <p className="mt-1 text-xs text-red-700">
            Kód: {result.code} · {PRAGUE_DATETIME.format(new Date(result.checkedAt))}
          </p>
        </div>
      )}

      {result && result.ok && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mt-4 text-sm">
          <p className="font-medium text-green-800">Připojení funguje — účet ověřen jen pro čtení</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {PRAGUE_DATETIME.format(new Date(result.checkedAt))} · požadavků na API: {result.requestCount}
          </p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-3">
            <dt className="text-neutral-500">Agenda</dt>
            <dd>{result.agenda.name ?? "—"}</dd>
            <dt className="text-neutral-500">IČO</dt>
            <dd>
              {result.agenda.ico ?? "—"}{" "}
              <YesNo
                value={result.isBeginaAgenda}
                yes="(IČO Beginy)"
                no="(není IČO Beginy)"
                unknown="(FINANCE_COMPANY_ICO není nastavené)"
              />
            </dd>
            <dt className="text-neutral-500">DPH v iDokladu</dt>
            <dd>
              {result.agenda.vatMode ? VAT_LABELS[result.agenda.vatMode] : "neznámé"}{" "}
              <YesNo
                value={result.vatMatches}
                yes="— souhlasí s nastavením MojeBegina"
                no="— NESOUHLASÍ s FINANCE_VAT_MODE"
                unknown="(FINANCE_VAT_MODE není nastavené)"
              />
            </dd>
            <dt className="text-neutral-500">Tarif</dt>
            <dd>
              {result.agenda.subscription ?? "—"}
              {result.agenda.subscriptionTrial ? " (zkušební)" : ""}
              {result.agenda.subscriptionTo ? `, do ${result.agenda.subscriptionTo}` : ""}
            </dd>
          </dl>

          <table className="w-full mt-4 text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-200">
                <th className="py-1 font-normal">Agenda v iDokladu</th>
                <th className="py-1 font-normal text-right">Počet záznamů</th>
              </tr>
            </thead>
            <tbody>
              {result.counts.map((row) => (
                <tr key={row.collection} className="border-b border-neutral-100">
                  <td className="py-1">{row.label}</td>
                  <td className="py-1 text-right">
                    {row.total !== null ? row.total.toLocaleString("cs-CZ") : <span className="text-red-700">{row.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt-6 text-sm font-medium text-begina-primary-900">Číselné řady v iDokladu (jen čtení)</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Pro výběr e-shopové řady vydaných faktur (IDOKLAD_ESHOP_SEQUENCE_ID): řada pro vydané faktury, která NENÍ
            výchozí. Nic se tu nezakládá ani nemění.
          </p>
          {sequences === undefined ? (
            <p className="mt-2 text-sm text-neutral-500">Výpis řad v tomto výsledku chybí — spusťte test znovu.</p>
          ) : sequences === null ? (
            <p className="mt-2 text-sm text-red-700">{sequencesError ?? "Číselné řady se nepodařilo načíst."}</p>
          ) : sequences.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Agenda nemá žádné číselné řady.</p>
          ) : (
            <table className="w-full mt-2 text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="py-1 font-normal">ID</th>
                  <th className="py-1 font-normal">Název</th>
                  <th className="py-1 font-normal">Formát</th>
                  <th className="py-1 font-normal">Typ dokladu</th>
                  <th className="py-1 font-normal">Výchozí</th>
                  <th className="py-1 font-normal text-right">Poslední číslo / rok</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map((row, i) => (
                  <tr key={row.id ?? `r${i}`} className="border-b border-neutral-100">
                    <td className="py-1 font-mono">{row.id ?? "—"}</td>
                    <td className="py-1">{row.name ?? "—"}</td>
                    <td className="py-1 font-mono">{row.numberFormat ?? "—"}</td>
                    <td className="py-1">{sequenceDocumentTypeLabel(row.documentType)}</td>
                    <td className="py-1">{row.isDefault === null ? "—" : row.isDefault ? "ano" : "ne"}</td>
                    <td className="py-1 text-right">
                      {row.lastNumber ?? "—"}
                      {row.year ? ` / ${row.year}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.refreshTokenReturned && (
            <p className="mt-3 text-xs text-amber-800">
              iDoklad vrátil i refresh token, přestože nebyl vyžádán — byl okamžitě zahozen.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
