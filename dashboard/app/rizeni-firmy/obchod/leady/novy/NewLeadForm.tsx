"use client";

import { useActionState } from "react";
import { createLeadAction, type ActionState } from "../../actions";
import { LEAD_SOURCES, VENUE_TYPES } from "@/lib/data/leadValidation";
import { SOURCE_LABELS, VENUE_TYPE_LABELS } from "../../leadLabels";
import type { LeadSource, VenueType } from "@/lib/data/leadValidation";

const initialState: ActionState = null;

export default function NewLeadForm() {
  const [state, formAction, pending] = useActionState(createLeadAction, initialState);

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-4"
    >
      <div>
        <label htmlFor="companyName" className="text-xs text-neutral-500 mb-1 block">
          Firma / provozovna
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          autoComplete="off"
          required
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="contactName" className="text-xs text-neutral-500 mb-1 block">
            Kontaktní osoba
          </label>
          <input
            id="contactName"
            name="contactName"
            type="text"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="venueType" className="text-xs text-neutral-500 mb-1 block">
            Typ provozu
          </label>
          <select
            id="venueType"
            name="venueType"
            defaultValue=""
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            <option value="">Neuvedeno</option>
            {VENUE_TYPES.map((type: VenueType) => (
              <option key={type} value={type}>
                {VENUE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="contactPhone" className="text-xs text-neutral-500 mb-1 block">
            Telefon
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="text"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className="text-xs text-neutral-500 mb-1 block">
            E-mail
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="city" className="text-xs text-neutral-500 mb-1 block">
            Město
          </label>
          <input
            id="city"
            name="city"
            type="text"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
        <div>
          <label htmlFor="ico" className="text-xs text-neutral-500 mb-1 block">
            IČO (pokud znáte, nepovinné)
          </label>
          <input
            id="ico"
            name="ico"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="address" className="text-xs text-neutral-500 mb-1 block">
          Adresa (nepovinné)
        </label>
        <input
          id="address"
          name="address"
          type="text"
          autoComplete="off"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div>
        <label htmlFor="source" className="text-xs text-neutral-500 mb-1 block">
          Zdroj leadu
        </label>
        <select
          id="source"
          name="source"
          required
          defaultValue=""
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            Vyberte zdroj…
          </option>
          {LEAD_SOURCES.map((source: LeadSource) => (
            <option key={source} value={source}>
              {SOURCE_LABELS[source]}
            </option>
          ))}
        </select>
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Ukládám…" : "Založit lead"}
      </button>
    </form>
  );
}
