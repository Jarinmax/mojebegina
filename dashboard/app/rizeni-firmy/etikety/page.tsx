// Úložiště etiket (11. 11. 2026) — finální etikety k tisku (Brother DK-22212).
// Přístup: celá sekce /rizeni-firmy (ADMIN + EXECUTIVE, viz layout.tsx).
// Soubory: public/etikety/…, seznam: lib/etikety/manifest.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import { ETIKETY_CATEGORIES, ETIKETY_NAMES } from "@/lib/etikety/structure";
import { ETIKETY_MANIFEST } from "@/lib/etikety/manifest";

export const metadata = { title: "Etikety — Řízení firmy" };

function displayName(file: string): string {
  const key = file.replace(/\.[a-z0-9]+$/i, "").replace(/^(FINAL_)?(Etiketa_)?/i, "").toLowerCase();
  if (ETIKETY_NAMES[key]) return ETIKETY_NAMES[key];
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

type SP = { jazyk?: string; kat?: string; typ?: string };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={
        "px-3 py-1.5 rounded-full text-sm font-medium border text-center max-w-full " +
        (active
          ? "bg-begina-primary-900 text-white border-begina-primary-900"
          : "bg-white text-begina-primary-900 border-neutral-300 hover:border-begina-primary-900")
      }
    >
      {children}
    </Link>
  );
}

export default async function EtiketyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const jazyk = one(sp.jazyk) === "sk" ? "sk" : "cz";
  const cats = ETIKETY_CATEGORIES.filter((c) => (jazyk === "sk" ? c.slug.startsWith("sk-") : !c.slug.startsWith("sk-")));
  const label = (c: { label: string }) => c.label.replace(/^🇸🇰\s*SK\s*–\s*/, "");
  const cat = cats.find((c) => c.slug === one(sp.kat)) ?? cats[0];
  const groups = cat?.groups ?? [];
  const group = groups.find((g) => g.slug === one(sp.typ)) ?? groups[0];
  const folder = cat ? (group ? `${cat.slug}/${group.slug}` : cat.slug) : "";
  const url = (o: SP) => {
    const q = new URLSearchParams();
    q.set("jazyk", o.jazyk ?? jazyk);
    if (o.kat) q.set("kat", o.kat);
    if (o.typ) q.set("typ", o.typ);
    return `/rizeni-firmy/etikety?${q.toString()}`;
  };

  return (
    <div>
      <div className="mt-3 mb-4">
        <h1 className="text-lg font-medium text-begina-primary-900">Etikety</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Finální etikety k tisku — Brother 62 mm, délka 120 mm, měřítko 100 %. Červeno-černé jen s rolí DK-22251.
        </p>
      </div>

      <div className="sm:sticky sm:top-0 z-10 bg-neutral-50/95 backdrop-blur py-3 -mx-1 px-1 flex flex-col gap-2 border-b border-neutral-200 mb-5">
        <div className="flex flex-wrap gap-2">
          <Pill href={url({ jazyk: "cz" })} active={jazyk === "cz"}>🇨🇿 Česky</Pill>
          <Pill href={url({ jazyk: "sk" })} active={jazyk === "sk"}>🇸🇰 Slovensky</Pill>
        </div>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <Pill key={c.slug} href={url({ kat: c.slug })} active={c.slug === cat?.slug}>
              {label(c)}
            </Pill>
          ))}
        </div>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Pill key={g.slug} href={url({ kat: cat!.slug, typ: g.slug })} active={g.slug === group?.slug}>
                {g.label}
              </Pill>
            ))}
          </div>
        )}
      </div>

      {cat && (
        <section>
          <h2 className="text-base font-medium text-begina-primary-900 mb-3">
            {label(cat)}
            {group ? ` · ${group.label}` : ""}
          </h2>
          <FileGrid folder={folder} />
        </section>
      )}
    </div>
  );
}
