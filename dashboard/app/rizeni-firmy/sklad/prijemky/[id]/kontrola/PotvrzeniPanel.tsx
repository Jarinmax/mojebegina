"use client";

// Potvrzení příjemky (blokující bod 2): překážky potvrzení zastaví vždy,
// varování jen dokud je člověk jednotlivě výslovně neodsouhlasí. Výsledek
// kontrol přichází ze serveru (getGoodsReceiptConfirmationCheck) a server
// je při potvrzení spočítá znovu pod zámkem příjemky — souhlas s varováním,
// které se mezitím změnilo (jiná částka), neplatí.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmGoodsReceiptAction } from "../../../actions";
import { formatKc, type ConfirmationChecks } from "@/lib/data/skladConfirmationChecks";

export default function PotvrzeniPanel({
  receiptId,
  checks,
  canConfirm,
}: {
  receiptId: string;
  checks: ConfirmationChecks;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAcknowledged = checks.warnings.every((warning) => acknowledged.has(warning.key));
  const ready = canConfirm && checks.blockers.length === 0 && allAcknowledged;

  function toggle(key: string, checked: boolean) {
    setAcknowledged((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await confirmGoodsReceiptAction(
      receiptId,
      checks.warnings.map((warning) => warning.key).filter((key) => acknowledged.has(key))
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setAcknowledged(new Set());
      router.refresh();
      return;
    }
    router.push(`/rizeni-firmy/sklad/prijemky/${receiptId}`);
    router.refresh();
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-begina-primary-900">Potvrzení příjemky</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Součet řádků {formatKc(checks.linesTotalHal)} · celkem na dokladu{" "}
          {checks.documentTotalHal === null ? "nezadáno" : formatKc(checks.documentTotalHal)}. Teprve potvrzením se zboží zapíše
          do skladu.
        </p>
      </div>

      {checks.blockers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex flex-col gap-1">
          <p className="font-medium">Zatím nelze potvrdit:</p>
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {checks.blockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      )}

      {checks.warnings.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex flex-col gap-2">
          <p className="font-semibold">⚠ Varování — před potvrzením je musíte každé výslovně odsouhlasit</p>
          {checks.warnings.map((warning) => (
            <label key={warning.key} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged.has(warning.key)}
                onChange={(event) => toggle(warning.key, event.target.checked)}
              />
              <span>
                {warning.message} <span className="font-medium">Zkontroloval(a) jsem a přesto potvrzuji.</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {canConfirm ? (
        <button
          type="button"
          disabled={!ready || pending}
          onClick={handleConfirm}
          className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
        >
          {pending ? "Potvrzuji…" : "Potvrdit příjemku a naskladnit"}
        </button>
      ) : (
        <p className="text-xs text-neutral-500">Příjemku může potvrdit jen oprávněná osoba.</p>
      )}
      {error && <p className="text-sm text-red-800">{error}</p>}
    </div>
  );
}
