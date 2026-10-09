"use client";

// Sklad 1.0 (mobilní tok) — body 2+11 zadání: "Vyfotit stranu", "Přidat
// další stranu", náhledy uložených stran. Orchestruje celý klientský běh:
// HEIC/velké foto → JPEG + SHA-256 (prepareImageForUpload, čistě
// prohlížečový kód bez importu sem) → přímý upload do Blobu přes OIDC
// podepsaný token (uploadPresigned) → finalizace zápisu do DB (samostatný
// POST, ne onUploadCompleted webhook — ten by vyžadoval veřejně dostupnou
// URL navíc).
import { useRef, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import { prepareImageForUpload } from "@/lib/sklad/clientUpload";
import { buildDocumentPagePathname } from "@/lib/data/skladValidation";

type PageRef = { id: string };

export default function FotoCapture({ receiptId, initialPages }: { receiptId: string; initialPages: PageRef[] }) {
  const [pages, setPages] = useState<PageRef[]>(initialPages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { blob, sha256 } = await prepareImageForUpload(file);
      const pathname = buildDocumentPagePathname(receiptId, crypto.randomUUID());

      await uploadPresigned(pathname, blob, {
        access: "private",
        handleUploadUrl: `/api/sklad/prijemky/${receiptId}/upload-token`,
        contentType: "image/jpeg",
      });

      const response = await fetch(`/api/sklad/prijemky/${receiptId}/stranky`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathname, sha256, mimeType: "image/jpeg" }),
      });
      const result = (await response.json()) as { pageId?: string; error?: string };
      if (!response.ok || !result.pageId) {
        throw new Error(result.error ?? "Uložení strany dokladu selhalo.");
      }

      setPages((prev) => [...prev, { id: result.pageId as string }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nahrání fotky selhalo.");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {busy ? "Nahrávám…" : pages.length === 0 ? "Vyfotit stranu" : "Přidat další stranu"}
      </button>

      {error && <p className="text-sm text-begina-accent-700">{error}</p>}

      {pages.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {pages.map((page, index) => (
            // Gated privátní náhled přes autorizovanou route — next/image
            // by ho optimalizoval přes server-side fetch bez jistoty, že
            // ponese stejnou autentizaci (bod 9 zadání: originál jen přes
            // gate), proto obyčejný <img>.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={page.id}
              src={`/api/sklad/prijemky/${receiptId}/stranky/${page.id}`}
              alt={`Strana ${index + 1}`}
              className="w-full aspect-[3/4] object-cover rounded-lg border border-neutral-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}
