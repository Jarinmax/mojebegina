"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressPhoto } from "./compressPhoto";

type Pending = { key: string; preview: string; state: "uploading" | "error"; error?: string };

// Práce 2.0 — přiložení fotek: „Vyfotit“ (rovnou fotoaparát) nebo „Z galerie“
// (i více najednou). Každá fotka se hned zmenší, zbaví metadat a uloží;
// během ukládání je vidět náhled. Uložené fotky jsou v galerii nad tímto
// formulářem a dokud úkol není odeslaný, jdou odstranit.
export default function PhotoUploader({ taskId, remaining }: { taskId: string; remaining: number }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const key = `${Date.now()}-${Math.random()}`;
    const preview = URL.createObjectURL(file);
    setPending((p) => [...p, { key, preview, state: "uploading" }]);
    const fail = (error: string) => setPending((p) => p.map((x) => (x.key === key ? { ...x, state: "error", error } : x)));
    try {
      let blob: Blob;
      try {
        blob = await compressPhoto(file);
      } catch {
        return fail("Tento formát fotky se nepodařilo zpracovat. Zkuste fotku z fotoaparátu nebo JPEG.");
      }
      const form = new FormData();
      form.set("taskId", taskId);
      form.set("photo", blob, "foto.jpg");
      const res = await fetch("/api/prace/foto", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return fail(body.error ?? "Fotografii se nepodařilo uložit.");
      setPending((p) => p.filter((x) => x.key !== key));
      URL.revokeObjectURL(preview);
      router.refresh();
    } catch {
      fail("Fotografii se nepodařilo odeslat — zkontrolujte připojení a zkuste to znovu.");
    }
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, Math.max(0, remaining))) void upload(file);
  }

  function dismiss(key: string) {
    setPending((p) => {
      const item = p.find((x) => x.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return p.filter((x) => x.key !== key);
    });
  }

  const button = "min-h-11 rounded-lg px-4 py-2 text-sm font-medium";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={remaining <= 0} onClick={() => camera.current?.click()} className={`${button} bg-blue-600 text-white disabled:opacity-50`}>
          📷 Vyfotit
        </button>
        <button type="button" disabled={remaining <= 0} onClick={() => gallery.current?.click()} className={`${button} border border-blue-300 bg-white text-blue-700 disabled:opacity-50`}>
          Z galerie
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {remaining <= 0 && <p className="text-xs text-neutral-500">Dosažen maximální počet fotografií.</p>}
      {pending.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {pending.map((p) => (
            <li key={p.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- lokální náhled (blob:) před uložením */}
              <img src={p.preview} alt="Náhled fotografie" className={`aspect-square w-full rounded-lg object-cover ${p.state === "uploading" ? "opacity-60" : ""}`} />
              {p.state === "uploading" ? (
                <span className="absolute inset-x-0 bottom-1 text-center text-xs font-medium text-white drop-shadow">Ukládám…</span>
              ) : (
                <div className="mt-1">
                  <p className="text-xs text-red-700">{p.error}</p>
                  <button type="button" onClick={() => dismiss(p.key)} className="text-xs underline text-neutral-600 min-h-8">
                    Zavřít
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
