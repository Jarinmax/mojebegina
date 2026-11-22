"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { convertLeadToNewOrganizationAction, type ActionState } from "../../../actions";
import { aresLookupByIcoAction, aresSearchByNameAction, type AresPrefill } from "./aresActions";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  defaultName: string;
  defaultIco: string;
  defaultContactName: string;
  defaultContactEmail: string;
};

type AresStatus =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "filled"; text: string }
  | { kind: "info"; text: string };

const inputClass = "w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900";

// Jarin 22. 11. 2026: obchodník napíše IČO nebo název firmy a formulář se sám
// předvyplní z ARES (oficiální název a sídlo). Kontakt a e-mail jsou z leadu —
// ARES je neobsahuje. Vše jde dál ručně upravit.
export default function NewOrganizationForm({
  leadId,
  defaultName,
  defaultIco,
  defaultContactName,
  defaultContactEmail,
}: Props) {
  const boundAction = convertLeadToNewOrganizationAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const [name, setName] = useState(defaultName);
  const [ico, setIco] = useState(defaultIco);
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<AresStatus>({ kind: "idle" });
  const [suggestions, setSuggestions] = useState<AresPrefill[]>([]);
  const [, startTransition] = useTransition();

  // Poslední IČO, které už bylo z ARES načtené (ať se nenačítá dokola).
  const lastIcoLookup = useRef<string | null>(null);
  const searchSeq = useRef(0);

  function applyCompany(company: AresPrefill) {
    lastIcoLookup.current = company.ico;
    searchSeq.current++; // zahodit rozběhnuté hledání podle názvu
    setName(company.name);
    setIco(company.ico);
    if (company.address) setAddress(company.address);
    setSuggestions([]);
    setStatus({ kind: "filled", text: `Doplněno z ARES: ${company.name}, IČO ${company.ico}${company.dic ? `, DIČ ${company.dic}` : ""}.` });
  }

  function lookupIco(value: string) {
    if (!/^\d{8}$/.test(value) || lastIcoLookup.current === value) return;
    lastIcoLookup.current = value;
    setStatus({ kind: "loading", text: "Hledám IČO v ARES…" });
    startTransition(async () => {
      const result = await aresLookupByIcoAction(value);
      if (result.ok) {
        applyCompany(result.company);
      } else if (result.reason === "not_found") {
        setStatus({ kind: "info", text: "Toto IČO v ARES není. Zkontrolujte ho, nebo údaje vyplňte ručně." });
      } else {
        lastIcoLookup.current = null;
        setStatus({ kind: "info", text: "ARES teď neodpovídá — údaje vyplňte ručně." });
      }
    });
  }

  // Při otevření: lead už IČO má → rovnou doplnit sídlo.
  useEffect(() => {
    lookupIco(defaultIco.replace(/\s/g, ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hledání podle názvu (s krátkou prodlevou po psaní).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  function scheduleNameSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setStatus({ kind: "loading", text: "Hledám firmu v ARES…" });
      const result = await aresSearchByNameAction(query);
      if (seq !== searchSeq.current) return;
      if (!result.ok) {
        setSuggestions([]);
        setStatus({ kind: "info", text: "ARES teď neodpovídá — údaje vyplňte ručně." });
        return;
      }
      setSuggestions(result.companies);
      setStatus(
        result.companies.length
          ? { kind: "info", text: "Vyberte firmu ze seznamu — doplní se IČO a sídlo." }
          : { kind: "info", text: "V ARES nic nenalezeno. Zkuste IČO nebo přesnější název." }
      );
    }, 500);
  }

  return (
    <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
      <p className="text-xs text-neutral-500 -mt-1">
        Napište IČO nebo název firmy — název a sídlo se doplní z ARES.
      </p>

      <div className="relative">
        <label htmlFor="name" className="text-xs text-neutral-500 mb-1 block">
          Název firmy
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            scheduleNameSearch(e.target.value);
          }}
          className={inputClass}
        />
        {suggestions.length > 0 && (
          <ul className="mt-1 border border-neutral-200 rounded-lg bg-white divide-y divide-neutral-100 overflow-hidden">
            {suggestions.map((company) => (
              <li key={company.ico}>
                <button
                  type="button"
                  onClick={() => applyCompany(company)}
                  className="w-full text-left px-3 py-2.5 hover:bg-neutral-50 active:bg-neutral-100"
                >
                  <span className="block text-sm text-begina-primary-900">{company.name}</span>
                  <span className="block text-xs text-neutral-500">
                    IČO {company.ico}
                    {company.address ? ` · ${company.address}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="ico" className="text-xs text-neutral-500 mb-1 block">
          IČO
        </label>
        <input
          id="ico"
          name="ico"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{8}"
          maxLength={8}
          autoComplete="off"
          required
          value={ico}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "").slice(0, 8);
            setIco(value);
            lookupIco(value);
          }}
          className={inputClass}
        />
      </div>

      {status.kind !== "idle" && (
        <p className={`text-xs -mt-2 ${status.kind === "filled" ? "text-green-700" : "text-neutral-500"}`} aria-live="polite">
          {status.text}
        </p>
      )}

      <div>
        <label htmlFor="registeredAddress" className="text-xs text-neutral-500 mb-1 block">
          Adresa sídla
        </label>
        <input
          id="registeredAddress"
          name="registeredAddress"
          type="text"
          autoComplete="off"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="contactName" className="text-xs text-neutral-500 mb-1 block">
          Jméno kontaktní osoby
        </label>
        <input
          id="contactName"
          name="contactName"
          type="text"
          autoComplete="off"
          required
          defaultValue={defaultContactName}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="contactEmail" className="text-xs text-neutral-500 mb-1 block">
          E-mail kontaktní osoby
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          autoComplete="off"
          required
          defaultValue={defaultContactEmail}
          className={inputClass}
        />
        <p className="text-xs text-neutral-400 mt-1">
          Založí organizaci a uživatele bez odeslání e-mailu — pozvánku pošlete později v Adminu.
        </p>
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Zakládám…" : "Založit jako novou organizaci a převést lead"}
      </button>
    </form>
  );
}
