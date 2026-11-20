"use client";

import { HEARD_FROM_DETAIL_HINT, HEARD_FROM_LABELS, HEARD_FROM_OPTIONS, type HeardFrom } from "@/lib/data/heardFrom";

// „Odkud nás zná“ (Lucie 20. 11. 2026). Povinné, jakmile je zaškrtnuto
// „Dovolal/a jsem se“ a lead tu informaci ještě nemá — kontrolu dělá server
// (validateHeardFromInput), tady jen zvýraznění a nápověda. Řízené zvenku
// (value/detail/onChange), aby se při chybě nic neztratilo.
export default function HeardFromField({
  idPrefix,
  required,
  known,
  value,
  detail,
  onChange,
}: {
  idPrefix: string;
  required: boolean;
  /** Lead už má uloženo — pole jde jen změnit. */
  known: boolean;
  value: string;
  detail: string;
  onChange: (next: { value?: string; detail?: string }) => void;
}) {
  const hint = value ? HEARD_FROM_DETAIL_HINT[value as HeardFrom] : undefined;
  const missing = required && !value;

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        missing ? "border-red-300 bg-red-50" : known ? "border-neutral-200 bg-white" : "border-amber-200 bg-amber-50"
      }`}
    >
      <label htmlFor={`${idPrefix}-heardFrom`} className="text-sm font-medium text-begina-primary-900 block mb-1">
        Odkud nás zná?{!known && <span className="text-red-700"> *</span>}
      </label>
      <select
        id={`${idPrefix}-heardFrom`}
        name="heardFrom"
        value={value}
        onChange={(e) => onChange({ value: e.target.value })}
        required={required}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
      >
        <option value="">{known ? "Ponechat" : "Vyber…"}</option>
        {HEARD_FROM_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {HEARD_FROM_LABELS[o]}
          </option>
        ))}
      </select>
      {hint && (
        <input
          name="heardFromDetail"
          type="text"
          value={detail}
          onChange={(e) => onChange({ detail: e.target.value })}
          required={value === "jine"}
          placeholder={hint}
          className="mt-2 w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        />
      )}
      <p className={`text-xs mt-1 ${missing ? "text-red-700" : "text-neutral-500"}`}>
        {known
          ? "Už zjištěno — měň jen, když je to špatně."
          : "Povinné po každém hovoru, kdy ses dovolal/a. Bez toho zápis neuložíš."}
      </p>
    </div>
  );
}
