"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ProjectKind } from "@/lib/projekt/areas";
import { addProjectEntryAction, type ProjectActionState } from "./actions";

const input = "w-full min-w-0 box-border rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white text-neutral-900";

const COPY: Record<ProjectKind, { title?: string; titlePlaceholder?: string; body: string; bodyPlaceholder: string; url: boolean; submit: string }> = {
  status: { body: "Kde to teď je", bodyPlaceholder: "Krátce: co je hotové, na čem se pracuje, co se čeká.", url: false, submit: "Uložit stav" },
  decision: { title: "Co jsme rozhodli", titlePlaceholder: "např. Sirupy všude 650 ml, cena 199 Kč", body: "Proč / podrobnosti (nepovinné)", bodyPlaceholder: "", url: false, submit: "Zapsat rozhodnutí" },
  output: { title: "Název", titlePlaceholder: "např. Plán příspěvků na prosinec", body: "Poznámka (nepovinné)", bodyPlaceholder: "", url: true, submit: "Přidat výstup" },
};

export default function AddEntryForm({ area, kind, defaultBody }: { area: string; kind: ProjectKind; defaultBody?: string }) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(addProjectEntryAction, null);
  const form = useRef<HTMLFormElement>(null);
  const copy = COPY[kind];
  useEffect(() => {
    if (state && "success" in state && kind !== "status") form.current?.reset();
  }, [state, kind]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-2 pt-3">
      <input type="hidden" name="area" value={area} />
      <input type="hidden" name="kind" value={kind} />
      {copy.title && (
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          {copy.title}
          <input className={input} name="title" placeholder={copy.titlePlaceholder} maxLength={200} required />
        </label>
      )}
      {copy.url && (
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Odkaz
          <input className={input} name="url" type="url" inputMode="url" placeholder="https://…" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
        {copy.body}
        <textarea className={input} name="body" rows={kind === "status" ? 4 : 2} maxLength={2000} placeholder={copy.bodyPlaceholder} defaultValue={defaultBody} required={kind === "status"} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-begina-primary-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "Ukládám…" : copy.submit}
        </button>
        {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
        {state && "success" in state && <p className="text-sm text-green-800">{state.success}</p>}
      </div>
    </form>
  );
}
