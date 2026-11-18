"use client";

// Audit číslování vydaných faktur v iDokladu (jen čtení). Výsledek se
// nikam neukládá — jen se zobrazí.
import { useActionState } from "react";
import { runNumberingAuditAction, type NumberingAuditActionState } from "../actions";

const LEVELS = {
  error: { label: "Chyba", tone: "text-red-700" },
  warning: { label: "K vysvětlení", tone: "text-amber-700" },
  info: { label: "Přípustné", tone: "text-neutral-500" },
} as const;

const dash = (value: string | number | null) => (value === null || value === "" ? "—" : String(value));

export default function NumberingAuditPanel({ defaultYear, defaultNumbers }: { defaultYear: string; defaultNumbers: string[] }) {
  const [state, formAction, pending] = useActionState<NumberingAuditActionState, FormData>(runNumberingAuditAction, null);
  const result = state && "result" in state ? state.result : null;
  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Rok</span>
          <input name="year" defaultValue={defaultYear} className="w-24 rounded-lg border border-neutral-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Čísla faktur k podrobnému výpisu (oddělená čárkou)</span>
          <input name="numbers" defaultValue={defaultNumbers.join(", ")} className="rounded-lg border border-neutral-300 px-2 py-1 font-mono" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-lg bg-begina-primary-900 px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Čtu iDoklad…" : "Spustit audit číslování (jen čtení)"}
        </button>
      </form>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {result && !result.ok && <p className="text-sm text-red-700">Audit se nedokončil: {result.error}</p>}
      {result?.ok && (
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <p className="mb-1 font-medium text-begina-primary-900">Řady vydaných faktur ({result.year})</p>
            <table className="w-full">
              <tbody>
                {result.series.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">
                      {s.name} <span className="text-xs text-neutral-500">ID {s.id}{s.isDefault ? " · výchozí" : ""}</span>
                    </td>
                    <td className="py-1 pr-2 font-mono text-xs">{dash(s.format)}</td>
                    <td className="py-1 pr-2">{s.count} dokl.</td>
                    <td className="py-1 font-mono text-xs">
                      {dash(s.first)} – {dash(s.last)}
                      {s.truncated && " (neúplné)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 font-medium text-begina-primary-900">Zjištění</p>
            {result.findings.length === 0 ? (
              <p className="text-green-700">Žádné duplicity, mezery ani nesoulad dat.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {result.findings.map((f, i) => (
                  <li key={i} className={LEVELS[f.level].tone}>
                    <span className="font-medium">{LEVELS[f.level].label}</span> · {f.series}: {f.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-x-auto">
            <p className="mb-1 font-medium text-begina-primary-900">Vybraná čísla</p>
            <table className="w-full text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="pr-2 text-left font-normal">Číslo</th>
                  <th className="pr-2 text-left font-normal">Řada</th>
                  <th className="pr-2 text-left font-normal">Vystavení</th>
                  <th className="pr-2 text-left font-normal">DUZP</th>
                  <th className="pr-2 text-left font-normal">Úhrada</th>
                  <th className="pr-2 text-left font-normal">Vytvořeno v iDokladu</th>
                  <th className="pr-2 text-left font-normal">Poslední změna</th>
                  <th className="text-left font-normal">Odběratel · VS · Kč</th>
                </tr>
              </thead>
              <tbody>
                {result.focus.map(({ number, document: d }) => (
                  <tr key={number} className="border-b border-neutral-100 align-top">
                    <td className="py-1 pr-2 font-mono">{number}</td>
                    {d ? (
                      <>
                        <td className="py-1 pr-2">{d.seriesName} ({d.seriesId})</td>
                        <td className="py-1 pr-2">{dash(d.dateOfIssue)}</td>
                        <td className="py-1 pr-2">{dash(d.dateOfTaxing)}</td>
                        <td className="py-1 pr-2">{dash(d.dateOfPayment)}</td>
                        <td className="py-1 pr-2 font-mono">{dash(d.created)}</td>
                        <td className="py-1 pr-2 font-mono">{dash(d.lastChange)}</td>
                        <td className="py-1">
                          {dash(d.partner)} · {dash(d.variableSymbol)} · {dash(d.totalKc)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="py-1 text-red-700">v řadách vydaných faktur nenalezeno</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-neutral-500">
            {new Date(result.checkedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })} · požadavků na iDoklad:{" "}
            {result.requestCount} (jen čtení + token). Čas „Vytvořeno“ je tak, jak ho vrací iDoklad (bez převodu pásma).
          </p>
        </div>
      )}
    </div>
  );
}
