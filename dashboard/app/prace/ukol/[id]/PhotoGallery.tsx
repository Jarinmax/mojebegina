"use client";

import { useActionState } from "react";
import { removeWorkTaskPhotoAction, type PraceActionState } from "../../actions";

export type GalleryPhoto = { id: string; caption: string; removable: boolean };

function RemoveButton({ photoId, taskId }: { photoId: string; taskId: string }) {
  const [state, action, pending] = useActionState<PraceActionState, FormData>(removeWorkTaskPhotoAction.bind(null, photoId, taskId), null);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="min-h-9 text-xs font-medium text-red-700 underline disabled:opacity-50">
        {pending ? "Odstraňuji…" : "Odstranit"}
      </button>
      {state && "error" in state && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

// Práce 2.0 — uložené fotky. Klepnutí otevře fotku v plné velikosti (běžný
// odkaz → nativní prohlížení s přiblížením na iPhonu i Androidu). Obrázky
// jdou přes /api/prace/foto/[id] (kontrola oprávnění + krátký odkaz).
export default function PhotoGallery({ photos, taskId }: { photos: GalleryPhoto[]; taskId: string }) {
  if (photos.length === 0) return <p className="text-sm text-neutral-500">Zatím žádné fotografie.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2">
      {photos.map((p) => (
        <li key={p.id} className="flex flex-col">
          <a href={`/api/prace/foto/${p.id}`} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- soukromá fotka přes ověřený odkaz, ne přes next/image */}
            <img src={`/api/prace/foto/${p.id}`} alt={p.caption} loading="lazy" className="aspect-square w-full rounded-lg object-cover bg-neutral-100" />
          </a>
          <span className="text-[11px] leading-tight text-neutral-500 mt-0.5">{p.caption}</span>
          {p.removable && <RemoveButton photoId={p.id} taskId={taskId} />}
        </li>
      ))}
    </ul>
  );
}
