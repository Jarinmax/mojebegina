// Úložiště etiket (11. 11. 2026) — finální etikety k tisku (Brother DK-22212).
// Přístup: celá sekce /rizeni-firmy (ADMIN + EXECUTIVE, viz layout.tsx).
// Soubory: public/etikety/…, seznam: lib/etikety/manifest.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import { ETIKETY_NAMES } from "@/lib/etikety/structure";
import {
  isSoldSize,
  KIND_ROLL,
  categoriesFor,
  categoryFixedSize,
  categoryLabel,
  kindLabel,
  kindsFor,
  parseGroupSlug,
  sizeLabel,
  sizesFor,
  type Lang,
} from "@/lib/etikety/wizard";
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

type SP = { jazyk?: string; kat?: string; vel?: string; druh?: string; typ?: string };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function fileCount(folders: string[]): number {
  return folders.reduce((n, f) => n + (ETIKETY_MANIFEST[f]?.length ?? 0), 0);
}

function Tile({ href, title, sub }: { href: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-center min-h-20 rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-begina-primary-900"
    >
      <span className="text-base font-medium text-begina-primary-900">{title}</span>
      {sub && <span className="mt-0.5 text-xs text-neutral-500">{sub}</span>}
    </Link>
  );
}

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

const countLabel = (n: number) => (n === 1 ? "1 etiketa" : n >= 2 && n <= 4 ? `${n} etikety` : `${n} etiket`);

export default async function EtiketyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rawLang = one(sp.jazyk);
  // Krok jazyka přeskočen (Lucie 24. 11. 2026): rovnou české etikety, slovenské přes odkaz.
  const lang: Lang = rawLang === "sk" ? "sk" : "cz";
  const cats = categoriesFor(lang);
  const cat = cats.find((c) => c.slug === one(sp.kat)) ?? null;
  // Staré odkazy ?typ=… (před 17. 11. 2026) dál fungují.
  const legacy = one(sp.typ) ? parseGroupSlug(one(sp.typ)!) : null;
  const sizes = cat ? sizesFor(cat) : [];
  const wantedSize = one(sp.vel) ?? legacy?.size ?? null;
  const size: string | null = sizes.length === 0 ? null : sizes.find((s) => s === wantedSize) ?? (sizes.length === 1 ? sizes[0] : null);
  const sizeChosen = sizes.length === 0 || size !== null;
  const kinds = cat && sizeChosen ? kindsFor(cat, size) : [];
  const option = kinds.find((k) => k.kind === (one(sp.druh) ?? legacy?.kind)) ?? null;

  const url = (o: { jazyk?: Lang; kat?: string; vel?: string | null; druh?: string }) => {
    const q = new URLSearchParams();
    if (o.jazyk === "sk") q.set("jazyk", "sk");
    if (o.kat) q.set("kat", o.kat);
    if (o.vel) q.set("vel", o.vel);
    if (o.druh) q.set("druh", o.druh);
    const qs = q.toString();
    return `/rizeni-firmy/etikety${qs ? `?${qs}` : ""}`;
  };

  const crumbs: { label: string; href: string }[] = [{ label: "Etikety", href: url({}) }];
  if (lang === "sk") crumbs.push({ label: "🇸🇰 Slovensky", href: url({ jazyk: lang }) });
  if (lang && cat) crumbs.push({ label: categoryLabel(cat), href: url({ jazyk: lang, kat: cat.slug }) });
  if (lang && cat && sizeChosen) {
    const fixed = size ? sizeLabel(size) : categoryFixedSize(cat);
    if (fixed) crumbs.push({ label: fixed, href: url({ jazyk: lang, kat: cat.slug, vel: size }) });
  }
  if (lang && cat && option) crumbs.push({ label: kindLabel(lang, option.kind), href: url({ jazyk: lang, kat: cat.slug, vel: size, druh: option.kind }) });

  let step: ReactNode;
  if (!cat) {
    step = (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cats.map((c) => (
          <Tile
            key={c.slug}
            href={url({ jazyk: lang, kat: c.slug })}
            title={categoryLabel(c)}
            sub={sizesFor(c).length ? sizesFor(c).filter((s) => isSoldSize(c, s)).map(sizeLabel).join(" · ") : categoryFixedSize(c)}
          />
        ))}
      </div>
      <p className="mt-4 text-sm">
        <Link href={lang === "sk" ? url({}) : url({ jazyk: "sk" })} className="text-neutral-600 underline hover:text-begina-primary-900">
          {lang === "sk" ? "🇨🇿 Zpět na české etikety" : "🇸🇰 Slovenské etikety"}
        </Link>
      </p>
      </>
    );
  } else if (!sizeChosen) {
    const sizeTile = (s: string) => (
      <Tile
        key={s}
        href={url({ jazyk: lang, kat: cat.slug, vel: s })}
        title={sizeLabel(s)}
        sub={countLabel(fileCount(kindsFor(cat, s).map((k) => k.folder)))}
      />
    );
    const sold = sizes.filter((s) => isSoldSize(cat, s));
    const other = sizes.filter((s) => !isSoldSize(cat, s));
    step = (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{sold.map(sizeTile)}</div>
        {other.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-neutral-500">Další objemy (zatím neprodáváme)</summary>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">{other.map(sizeTile)}</div>
          </details>
        )}
      </div>
    );
  } else if (!option) {
    step = (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {kinds.map((k) => (
          <Tile
            key={k.kind}
            href={url({ jazyk: lang, kat: cat.slug, vel: size, druh: k.kind })}
            title={kindLabel(lang, k.kind)}
            sub={[KIND_ROLL[k.kind], countLabel(fileCount([k.folder]))].filter(Boolean).join(" · ")}
          />
        ))}
      </div>
    );
  } else {
    step = (
      <div>
        <div className="flex flex-wrap gap-2 mb-3">
          {kinds.map((k) => (
            <Pill key={k.kind} href={url({ jazyk: lang, kat: cat.slug, vel: size, druh: k.kind })} active={k.kind === option.kind}>
              {kindLabel(lang, k.kind)}
            </Pill>
          ))}
        </div>
        {KIND_ROLL[option.kind] && (
          <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            Do tiskárny vlož: <strong>{KIND_ROLL[option.kind]}</strong> · měřítko 100 %
          </p>
        )}
        <FileGrid folder={option.folder} />
      </div>
    );
  }

  const heading = !cat
      ? "Vyber výrobky"
      : !sizeChosen
        ? "Vyber množství"
        : !option
          ? "Vyber etiketu"
          : null;

  return (
    <div>
      <div className="mt-3 mb-4">
        <h1 className="text-lg font-medium text-begina-primary-900">Etikety</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Finální etikety k tisku — Brother 62 mm, délka 120 mm, měřítko 100 %.</p>
      </div>

      {crumbs.length > 1 && (
        <nav aria-label="Kde jsem" className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-neutral-400">›</span>}
              {i === crumbs.length - 1 ? (
                <span className="font-semibold text-begina-primary-900">{c.label}</span>
              ) : (
                <Link href={c.href} className="text-neutral-600 hover:underline">
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}

      {heading && <h2 className="text-sm font-medium text-neutral-600 mb-3">{heading}</h2>}
      {step}
    </div>
  );
}
