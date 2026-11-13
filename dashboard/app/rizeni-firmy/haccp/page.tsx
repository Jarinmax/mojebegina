// Úložiště HACCP (13. 11. 2026) — platná příručka HACCP pro kontrolu z hygieny.
// Přístup: celá sekce /rizeni-firmy (ADMIN + EXECUTIVE, viz layout.tsx).
// Soubory: public/haccp/…, seznam: lib/haccp/documents.ts.
import Link from "next/link";
import { HACCP_DOCUMENTS } from "@/lib/haccp/documents";

export const metadata = { title: "HACCP — Řízení firmy" };

export default function HaccpPage() {
  const current = HACCP_DOCUMENTS.filter((d) => d.current);
  const archive = HACCP_DOCUMENTS.filter((d) => !d.current);

  return (
    <div>
      <Link href="/rizeni-firmy" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Řízení firmy
      </Link>
      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">HACCP</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Platná příručka HACCP — Zahradní Bistro Begina, Vitice 119. Při kontrole z hygieny ukaž tuto verzi.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="text-base font-medium text-begina-primary-900 mb-3">Platná verze</h2>
          <DocumentList docs={current} />
        </section>
        {archive.length > 0 && (
          <section>
            <h2 className="text-base font-medium text-begina-primary-900 mb-3">Starší verze</h2>
            <DocumentList docs={archive} />
          </section>
        )}
      </div>
    </div>
  );
}

function DocumentList({ docs }: { docs: typeof HACCP_DOCUMENTS }) {
  if (docs.length === 0) {
    return (
      <p className="text-sm text-neutral-500 bg-white border border-dashed border-neutral-300 rounded-xl p-4">
        Zatím žádné dokumenty.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {docs.map((doc) => {
        const href = `/haccp/${encodeURIComponent(doc.file)}`;
        return (
          <div key={doc.file} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
            <a href={href} target="_blank" rel="noopener" className="block">
              <p className="text-sm font-medium text-begina-primary-900">{doc.title}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Verze {doc.version} · {doc.issued} · PDF
              </p>
            </a>
            {doc.note && <p className="text-sm text-neutral-600">{doc.note}</p>}
            <div className="flex items-center gap-4">
              <a href={href} target="_blank" rel="noopener" className="text-sm font-medium text-begina-primary-900 hover:underline">
                Otevřít
              </a>
              <a href={href} download={doc.file} className="text-sm font-medium text-begina-primary-900 hover:underline">
                Stáhnout
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
