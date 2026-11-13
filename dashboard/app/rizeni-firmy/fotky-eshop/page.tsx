// Fotky na e-shop (11. 11. 2026) — schválené produktové fotky po kategoriích.
// Přístup: celá sekce /rizeni-firmy (ADMIN + EXECUTIVE, viz layout.tsx).
// Soubory: public/fotky-eshop/…, seznam: lib/fotky-eshop/manifest.ts.
import Link from "next/link";
import { FOTKY_CATEGORIES, fotkyDisplayName } from "@/lib/fotky-eshop/structure";
import { FOTKY_MANIFEST } from "@/lib/fotky-eshop/manifest";

export const metadata = { title: "Fotky na e-shop — Řízení firmy" };

function PhotoGrid({ folder }: { folder: string }) {
  const files = FOTKY_MANIFEST[folder] ?? [];
  if (files.length === 0) {
    return <p className="text-sm text-neutral-500 bg-white border border-dashed border-neutral-300 rounded-xl p-4">Zatím žádné fotky.</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {files.map((file) => {
        const href = `/fotky-eshop/${folder}/${encodeURIComponent(file)}`;
        const name = fotkyDisplayName(file);
        return (
          <div key={file} className="bg-white border border-neutral-200 rounded-xl p-2 flex flex-col gap-2">
            <a href={href} target="_blank" rel="noopener" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={href} alt={name} loading="lazy" className="w-full aspect-square object-contain rounded bg-white" />
            </a>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-sm font-medium text-begina-primary-900 truncate">{name}</p>
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

export default function FotkyEshopPage() {
  return (
    <div>
      <Link href="/rizeni-firmy" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Řízení firmy
      </Link>
      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Fotky na e-shop</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Schválené produktové fotky — hlavní fotka, s beginou 3 l a se sáčkem.</p>
      </div>
      <div className="flex flex-col gap-8">
        {FOTKY_CATEGORIES.map((cat) => (
          <section key={cat.slug} id={cat.slug}>
            <h2 className="text-base font-medium text-begina-primary-900 mb-3">{cat.label}</h2>
            <div className="flex flex-col gap-5">
              {cat.groups.map((g) => (
                <div key={g.slug}>
                  <h3 className="text-sm font-medium text-neutral-600 mb-2">{g.label}</h3>
                  <PhotoGrid folder={`${cat.slug}/${g.slug}`} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
