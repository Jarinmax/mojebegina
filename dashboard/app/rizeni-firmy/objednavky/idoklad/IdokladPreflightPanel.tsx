"use client";

// ESHOP 1.0 — ruční kontrola připojení iDokladu (preflight, jen čtení).
// Výsledek se nikam neukládá — jen se zobrazí.
import { useActionState } from "react";
import { runIdokladPreflightAction, type PreflightActionState } from "../actions";

export default function IdokladPreflightPanel() {
  const [state, formAction, pending] = useActionState<PreflightActionState>(runIdokladPreflightAction, null);
  const result = state && "result" in state ? state.result : null;
  return (
    <div className="flex flex-col gap-3">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-begina-primary-900 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Kontroluji iDoklad…" : "Spustit kontrolu (jen čtení)"}
        </button>
      </form>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {result && (
        <div className="flex flex-col gap-2">
          <p className={`text-sm font-medium ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.ok
              ? "Všechny kontroly prošly — vystavení faktury by iDoklad pustil."
              : "Kontrola NEPROŠLA — vystavení faktury je zakázané, dokud se chyby neopraví."}
          </p>
          <table className="w-full text-sm">
            <tbody>
              {result.checks.map((check) => (
                <tr key={check.key} className="border-b border-neutral-100 align-top">
                  <td className={`py-1 pr-2 ${check.ok ? "text-green-700" : "text-red-700"}`}>{check.ok ? "✓" : "✗"}</td>
                  <td className="py-1 pr-3 text-neutral-900">{check.label}</td>
                  <td className="py-1 text-neutral-600">{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-500">
            {new Date(result.checkedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })} · požadavků na iDoklad:{" "}
            {result.requestCount} (jen čtení + získání tokenu)
          </p>
        </div>
      )}
    </div>
  );
}
