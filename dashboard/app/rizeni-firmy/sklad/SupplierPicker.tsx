"use client";

import { useState } from "react";
import { createSupplierForReceiptAction } from "./actions";
import type { SupplierSummary } from "@/lib/data/sklad";

// Sdílený výběr dodavatele (existující, nebo rovnou založit nového) — stejná
// logika v NovaPrijemkaForm (nová příjemka) i DodavatelForm (oprava na
// kontrolní obrazovce, když appka dodavatele z fotky nerozpoznala nebo ho
// dohledala špatně). Dodavatelé se drží v lokálním stavu (ne jen v props) —
// nový dodavatel se po založení přidá sem a rovnou vybere, BEZ
// reloadu/redirectu, který by smazal rozepsané údaje v okolním formuláři
// (revize mobilního testu, viz NovaPrijemkaForm).
export default function SupplierPicker({
  name,
  suppliers: initialSuppliers,
  defaultSelectedId = "",
  selectedId,
  onSelect,
  unknownLabel,
}: {
  name: string;
  suppliers: SupplierSummary[];
  /** Nekontrolovaný výchozí výběr (nová příjemka — appka pozná dodavatele z fotky). */
  defaultSelectedId?: string;
  /** Kontrolovaný výběr (kontrolní obrazovka — rodič potřebuje aktuální id pro uložení). */
  selectedId?: string;
  onSelect?: (supplierId: string) => void;
  /** Text prázdné volby — jiný pro novou příjemku ("appka pozná z fotky") než pro opravu existující. */
  unknownLabel: string;
}) {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>(initialSuppliers);
  const [uncontrolledId, setUncontrolledId] = useState(defaultSelectedId);
  const currentId = selectedId ?? uncontrolledId;

  const [showForm, setShowForm] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [ico, setIco] = useState("");
  const [dic, setDic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function select(id: string) {
    setUncontrolledId(id);
    onSelect?.(id);
  }

  async function handleCreate() {
    setPending(true);
    setError(null);
    try {
      const result = await createSupplierForReceiptAction({ name: supplierName, ico, dic });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const newSupplier: SupplierSummary = {
        id: result.supplierId,
        name: supplierName.trim(),
        ico: ico.trim() || null,
        dic: dic.trim() || null,
      };
      setSuppliers((prev) => [...prev, newSupplier]);
      select(newSupplier.id);
      setShowForm(false);
      setSupplierName("");
      setIco("");
      setDic("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <select
        id={name}
        name={name}
        value={currentId}
        onChange={(event) => select(event.target.value)}
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
      >
        <option value="">{unknownLabel}</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => {
          setShowForm((prev) => !prev);
          setError(null);
        }}
        className="text-xs font-medium text-begina-primary-900 underline mt-2"
      >
        {showForm ? "Zrušit zakládání dodavatele" : "+ Založit dodavatele"}
      </button>

      {showForm && (
        <div className="mt-3 border border-neutral-200 rounded-lg p-3 flex flex-col gap-3 bg-neutral-50">
          <div>
            <label htmlFor={`${name}-newName`} className="text-xs text-neutral-500 mb-1 block">
              Název *
            </label>
            <input
              id={`${name}-newName`}
              type="text"
              autoComplete="off"
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
              className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${name}-newIco`} className="text-xs text-neutral-500 mb-1 block">
                IČO (nepovinné)
              </label>
              <input
                id={`${name}-newIco`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={ico}
                onChange={(event) => setIco(event.target.value)}
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
              />
            </div>
            <div>
              <label htmlFor={`${name}-newDic`} className="text-xs text-neutral-500 mb-1 block">
                DIČ (nepovinné)
              </label>
              <input
                id={`${name}-newDic`}
                type="text"
                autoComplete="off"
                value={dic}
                onChange={(event) => setDic(event.target.value)}
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
              />
            </div>
          </div>

          {error && <p className="text-sm text-begina-accent-700">{error}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={handleCreate}
            className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
          >
            {pending ? "Ukládám…" : "Uložit dodavatele"}
          </button>
        </div>
      )}
    </div>
  );
}
