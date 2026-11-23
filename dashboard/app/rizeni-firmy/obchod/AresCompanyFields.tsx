"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { aresLookupByIcoAction, aresSearchByNameAction, type AresPrefill } from "./aresActions";

// Jarin 22. 11. 2026: obchodník napíše IČO nebo název firmy a pole se samy
// doplní z ARES (oficiální název, IČO, sídlo). Sdílí detail leadu (Firma)
// i převod na zákazníka. Pole jsou běžné inputy formuláře rodiče (name
// atributy se předávají), takže je odešle jeho server action. Vše jde ručně
// upravit; když ARES neodpoví, vyplní se ručně.

type AresStatus =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "filled"; text: string }
  | { kind: "info"; text: string };

const inputClass = "w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900";

type Props = {
  defaultName: string;
  defaultIco: string;
  defaultAddress: string;
  names: { name: string; ico: string; address: string };
  required?: boolean;
  addressLabel?: string;
  /** Hned po otevření načíst sídlo z ARES, když je IČO vyplněné. */
  lookupOnMount?: boolean;
};

export default function AresCompanyFields({
  defaultName,
  defaultIco,
  defaultAddress,
  names,
  required = false,
  addressLabel = "Adresa sídla",
  lookupOnMount = true,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [ico, setIco] = useState(defaultIco);
  const [address, setAddress] = useState(defaultAddress);
  const [status, setStatus] = useState<AresStatus>({ kind: "idle" });
  const [suggestions, setSuggestions] = useState<AresPrefill[]>([]);
  const [, startTransition] = useTransition();

  // Poslední IČO načtené z ARES (ať se nenačítá dokola) a pořadí hledání
  // podle názvu (starší odpověď nesmí přepsat novější).
  const lastIcoLookup = useRef<string | null>(null);
  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyCompany(company: AresPrefill) {
    lastIcoLookup.current = company.ico;
    searchSeq.current++;
    setName(company.name);
    setIco(company.ico);
    if (company.address) setAddress(company.address);
    setSuggestions([]);
    setStatus({
      kind: "filled",
      text: `Doplněno z ARES: ${company.name}, IČO ${company.ico}${company.dic ? `, DIČ ${company.dic}` : ""}.`,
    });
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

  useEffect(() => {
    if (lookupOnMount) lookupIco(defaultIco.replace(/\s/g, ""));
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="text-xs text-neutral-500">Napište IČO nebo název firmy — název a sídlo se doplní z ARES.</p>

      <div>
        <label htmlFor={names.name} className="text-xs text-neutral-500 mb-1 block">
          Název firmy
        </label>
        <input
          id={names.name}
          name={names.name}
          type="text"
          autoComplete="off"
          required={required}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            scheduleNameSearch(e.target.value);
          }}
          placeholder="Název firmy/provozovny…"
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
        <label htmlFor={names.ico} className="text-xs text-neutral-500 mb-1 block">
          IČO
        </label>
        <input
          id={names.ico}
          name={names.ico}
          type="text"
          inputMode="numeric"
          pattern="[0-9]{8}"
          maxLength={8}
          autoComplete="off"
          required={required}
          value={ico}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "").slice(0, 8);
            setIco(value);
            lookupIco(value);
          }}
          className={inputClass}
        />
        {status.kind !== "idle" && (
          <p
            className={`text-xs mt-1 ${status.kind === "filled" ? "text-green-700" : "text-neutral-500"}`}
            aria-live="polite"
          >
            {status.text}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={names.address} className="text-xs text-neutral-500 mb-1 block">
          {addressLabel}
        </label>
        <input
          id={names.address}
          name={names.address}
          type="text"
          autoComplete="off"
          required={required}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
        />
      </div>
    </>
  );
}
