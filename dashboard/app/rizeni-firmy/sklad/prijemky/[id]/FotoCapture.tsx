"use client";

// Sklad 1.0 (mobilní tok) — body 2+11 zadání: "Vyfotit stranu", "Přidat
// další stranu" (od druhé strany označené jako nepovinné), potvrzení po
// uložení každé strany, klikací náhled přes celou obrazovku a "Hotovo".
// Orchestruje celý klientský běh: HEIC/velké foto → JPEG + SHA-256
// (prepareImageForUpload, čistě prohlížečový kód bez importu sem) →
// přímý upload do Blobu přes OIDC podepsaný token (uploadPresigned) →
// finalizace zápisu do DB (samostatný POST, ne onUploadCompleted webhook —
// ten by vyžadoval veřejně dostupnou URL navíc).
import { useRef, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import { prepareImageForUpload } from "@/lib/sklad/clientUpload";
import { buildDocumentPagePathname } from "@/lib/data/skladValidation";

type PageRef = { id: string };

export default function FotoCapture({ receiptId, initialPages }: { receiptId: string; initialPages: PageRef[] }) {
  const [pages, setPages] = useState<PageRef[]>(initialPages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const { blob, sha256 } = await prepareImageForUpload(file);
      const pathname = buildDocumentPagePathname(receiptId, crypto.randomUUID());

      try {
        await uploadPresigned(pathname, blob, {
          access: "private",
          handleUploadUrl: `/api/sklad/prijemky/${receiptId}/upload-token`,
          contentType: "image/jpeg",
        });
      } catch {
        // @vercel/blob umí vyhodit anglické chyby (BlobFileTooLargeError
        // apod.) — appka je nikdy nezobrazí přímo, jen tuhle srozumitelnou
        // českou hlášku (bod 7 revize — chyby musí být česky a použitelné).
        throw new Error("Upload fotky do úložiště selhal. Zkontrolujte internetové připojení a zkuste to znovu.");
      }

      // keepalive: true — nejmenší bezpečné zmírnění rizika osiřelého Blobu,
      // když uživatel hned po uploadu zavře prohlížeč/odnaviguje (externí
      // revize, bod 5): dovolí prohlížeči tenhle požadavek dokončit i po
      // odchodu ze stránky. NEŘEŠÍ pád prohlížeče/ztrátu napájení přesně v
      // téhle mezeře — to zůstává zdokumentované omezení Preview (žádná
      // zpětná úklidová úloha nad Blob storem zatím neběží).
      const response = await fetch(`/api/sklad/prijemky/${receiptId}/stranky`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathname, sha256, mimeType: "image/jpeg" }),
        keepalive: true,
      });
      const result = (await response.json().catch(() => null)) as { pageId?: string; error?: string } | null;
      if (!response.ok || !result?.pageId) {
        throw new Error(result?.error ?? "Uložení strany dokladu selhalo. Zkuste to znovu.");
      }

      setPages((prev) => {
        const next = [...prev, { id: result.pageId as string }];
        setSavedMessage(`${next.length}. strana úspěšně uložena.`);
        return next;
      });
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
            setFinished(false);
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
        {busy ? "Nahrávám…" : pages.length === 0 ? "Vyfotit stranu" : "Přidat další stranu (nepovinné)"}
      </button>

      {savedMessage && !error && <p className="text-sm text-green-700">{savedMessage}</p>}
      {error && <p className="text-sm text-begina-accent-700">{error}</p>}

      {pages.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setPreviewPageId(page.id)}
              className="block p-0 border-0 bg-transparent cursor-pointer"
              aria-label={`Zobrazit stranu ${index + 1} přes celou obrazovku`}
            >
              {/* Gated privátní náhled přes autorizovanou route — next/image
                  by ho optimalizoval přes server-side fetch bez jistoty, že
                  ponese stejnou autentizaci (bod 9 zadání: originál jen přes
                  gate), proto obyčejný <img>. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/sklad/prijemky/${receiptId}/stranky/${page.id}`}
                alt={`Strana ${index + 1}`}
                className="w-full aspect-[3/4] object-cover rounded-lg border border-neutral-200"
              />
            </button>
          ))}
        </div>
      )}

      {pages.length > 0 && !finished && (
        <button
          type="button"
          onClick={() => setFinished(true)}
          className="text-sm font-medium text-begina-primary-900 border border-begina-primary-900 rounded-lg px-4 py-2.5"
        >
          Hotovo
        </button>
      )}
      {finished && <p className="text-sm text-neutral-500">Fotky dokladu jsou hotové — pokračujte níže.</p>}

      {previewPageId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Náhled strany přes celou obrazovku"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewPageId(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/sklad/prijemky/${receiptId}/stranky/${previewPageId}`}
            alt="Náhled strany přes celou obrazovku"
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            onClick={() => setPreviewPageId(null)}
            aria-label="Zavřít náhled"
            className="absolute top-4 right-4 text-white text-sm bg-black/50 rounded-full px-3 py-1.5"
          >
            Zavřít
          </button>
        </div>
      )}
    </div>
  );
}
