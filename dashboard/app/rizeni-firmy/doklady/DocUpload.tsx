"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPresigned } from "@vercel/blob/client";

// Doklady (Lucie 19. 11. 2026): nahrání PDF / fotek dokladů nákladů —
// víc souborů najednou (přetažením nebo výběrem), na mobilu i foťák.
// Soubor jde přímo do privátního Blobu, server pak ověří otisk a zapíše.

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mimeOf(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  return file.type;
}

async function uploadOne(file: File, month: string, entryId: string | null): Promise<void> {
  const mime = mimeOf(file);
  const ext = EXT[mime];
  if (!ext) throw new Error(`${file.name}: nahrávat jde jen PDF nebo fotky.`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: soubor je větší než 20 MB.`);
  const sha256 = await sha256Hex(file);
  const pathname = `doklady/${month}/${crypto.randomUUID()}.${ext}`;
  try {
    await uploadPresigned(pathname, file, { access: "private", handleUploadUrl: "/api/doklady/upload-token", contentType: mime });
  } catch {
    throw new Error(`${file.name}: nahrání do úložiště selhalo, zkuste to znovu.`);
  }
  const res = await fetch("/api/doklady", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ month, pathname, filename: file.name, mimeType: mime, sha256, entryId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`${file.name}: ${data.error ?? "uložení selhalo."}`);
  }
}

export default function DocUpload({
  month,
  entryId = null,
  compact = false,
}: {
  month: string;
  entryId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  async function handle(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    setErrors([]);
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setBusy(`Nahrávám ${i + 1} z ${list.length}…`);
      try {
        await uploadOne(list[i], month, entryId);
      } catch (e) {
        failed.push(e instanceof Error ? e.message : `${list[i].name}: chyba.`);
      }
    }
    setBusy(null);
    setErrors(failed);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const picker = (
    <input
      ref={input}
      type="file"
      multiple={!entryId}
      accept="application/pdf,image/*"
      className="hidden"
      onChange={(e) => e.target.files && handle(e.target.files)}
    />
  );

  if (compact) {
    return (
      <span className="inline-flex flex-col items-end">
        {picker}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => input.current?.click()}
          className="text-xs font-medium rounded-md border border-red-200 bg-red-50 text-red-700 px-2 py-1.5 whitespace-nowrap disabled:opacity-50"
        >
          {busy ?? "chybí PDF · Nahrát"}
        </button>
        {errors.map((e) => (
          <span key={e} className="text-[11px] text-red-700 max-w-[16rem] text-right">{e}</span>
        ))}
      </span>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-4 text-center bg-white ${over ? "border-begina-primary-900" : "border-neutral-300"}`}
    >
      {picker}
      <p className="text-sm font-semibold text-begina-primary-900">Přetáhni sem PDF nebo fotky dokladů</p>
      <p className="text-xs text-neutral-600 mt-1">Uloží se do tohoto měsíce. Pak je přiřadíš k řádku v Ekonomice.</p>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => input.current?.click()}
        className="mt-3 text-sm font-medium text-white bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {busy ?? "Vybrat soubory / vyfotit"}
      </button>
      {errors.length > 0 && (
        <ul className="mt-2 text-xs text-red-700 text-left">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
