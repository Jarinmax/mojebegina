"use client";

import { useActionState, useState } from "react";
import { updateLeadCompanyDetailsAction, type ActionState } from "../../actions";
import AresCompanyFields from "../../AresCompanyFields";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  companyName: string | null;
  ico: string | null;
  address: string | null;
};

// Jarin 22. 11. 2026: obchodník doplní u leadu firmu — název, IČO a sídlo,
// předvyplněné z ARES (napíše IČO nebo název). Převod na zákazníka je pak jen
// potvrzení (zakládá ADMIN). Nahrazuje samotný název firmy (CompanyNameForm).
//
// Zachováno z 22. 11. 2026 (Lucie, chyba u LumoKids): údaje se ukazují jako
// text s „Upravit“; pole s uložením se otevřou až po kliknutí a tlačítko je
// světlé „Uložit firmu“, ať se neplete s tmavým „Uložit zápis“ u hovoru.
export default function CompanyDetailsForm({ leadId, companyName, ico, address }: Props) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateLeadCompanyDetailsAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await boundAction(prev, formData);
    if (result && "success" in result) setEditing(false);
    return result;
  }, initialState);

  const hasAny = Boolean(companyName || ico || address);

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm ${companyName ? "text-begina-primary-900 font-medium" : "text-amber-800"}`}>
            {companyName ?? "Zatím neznámá"}
          </p>
          {(ico || address) && (
            <p className="text-xs text-neutral-500 mt-0.5">
              {[ico ? `IČO ${ico}` : null, address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-medium text-begina-primary-900 underline underline-offset-2 whitespace-nowrap"
        >
          {hasAny ? "Upravit" : "Doplnit firmu"}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} autoComplete="off" className="flex flex-col gap-3">
      <AresCompanyFields
        defaultName={companyName ?? ""}
        defaultIco={ico ?? ""}
        defaultAddress={address ?? ""}
        names={{ name: "companyName", ico: "ico", address: "address" }}
        addressLabel="Adresa (sídlo)"
        lookupOnMount={false}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-900 bg-white border border-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "Ukládám…" : "Uložit firmu"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500 px-2">
          Zrušit
        </button>
      </div>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
    </form>
  );
}
