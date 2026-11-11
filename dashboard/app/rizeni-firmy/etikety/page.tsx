// Úložiště etiket (11. 11. 2026) — finální etikety k tisku (Brother DK-22212).
// Přístup: celá sekce /rizeni-firmy (ADMIN + EXECUTIVE, viz layout.tsx).
// Soubory: public/etikety/…, seznam: lib/etikety/manifest.ts.
import Link from "next/link";
import { ETIKETY_CATEGORIES } from "@/lib/etikety/structure";
import { ETIKETY_MANIFEST } from "@/lib/etikety/manifest";

export const metadata = { title: "Etikety — Řízení firmy" };

function displayName(file: string): string {
  return file
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^(FINAL_)?(Etiketa_)?/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function FileGrid({ folder }: { folder: string }) {
  const files = ETIKETY_MANIFEST[folder] ?? [];
  if (files.length === 0) {
    return <p className="text-sm text-neutral-500 bg-white border border-dashed border-neutral-300 rounded-xl p-4">Zatím žádné etikety.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {files.map((file) => {
        const href = `/etikety/${folder}/${encodeURIComponent(file)}`;
        const isImage = !/\.pdf$/i.test(file);
        return (
          <div key={file} className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col gap-2">
            <a href={href} target="_blank" rel="noopener" className="block">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={href} alt={displayName(file)} loading="lazy" className="w-full h-auto rounded border border-neutral-100" />
              ) : (
                <div className="h-24 flex items-center justify-center rounded bg-neutral-50 text-sm text-neutral-500">PDF</div>
              )}
            </a>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-begina-primary-900 truncate">{displayName(file)}</p>
              <a href={href} download={file} className="text-sm font-medium text-begina-primary-900 hover:underline whitespace-nowrap">
                Stáhnout
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EtiketyPage() {
  return (
    <div>
      <Link href="/rizeni-firmy" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Řízení firmy
      </Link>
      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Etikety</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Finální etikety k tisku — role Brother DK-22212 (62 mm), délka 120 mm, měřítko 100 %.
        </p>
      </div>
      <div className="flex flex-col gap-8">
        {ETIKETY_CATEGORIES.map((cat) => (
          <section key={cat.slug} id={cat.slug}>
            <h2 className="text-base font-medium text-begina-primary-900 mb-3">{cat.label}</h2>
            {cat.groups ? (
              <div className="flex flex-col gap-5">
                {cat.groups.map((g) => (
                  <div key={g.slug}>
                    <h3 className="text-sm font-medium text-neutral-600 mb-2">{g.label}</h3>
                    <FileGrid folder={`${cat.slug}/${g.slug}`} />
                  </div>
                ))}
              </div>
            ) : (
              <FileGrid folder={cat.slug} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
