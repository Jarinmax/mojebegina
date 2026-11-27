"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { backTarget, breadcrumbs } from "@/lib/navigation/pageLabels";

// Navigace v Řízení firmy (Lucie 27. 11. 2026: „nikdy nevím, kam mě Zpět vrátí“).
// „← Zpět na …“ vede vždy o úroveň výš ve struktuře stránek a píše, kam
// (dřív se vracelo podle historie prohlížeče, a to nebylo poznat).
// Vedle je cesta „Řízení firmy › Recepty › Recept“ — každý díl je klikací.

function Nav({ search, fallback }: { search: string; fallback: string }) {
  return <NavView pathname={usePathname() ?? ""} search={search} fallback={fallback} />;
}

export function NavView({ pathname, search, fallback }: { pathname: string; search: string; fallback: string }) {
  const back = backTarget(pathname, fallback, search);
  const crumbs = breadcrumbs(pathname);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
      <Link
        href={back.href}
        className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 font-medium text-begina-primary-900 hover:border-begina-primary-900"
      >
        ← Zpět na {back.label}
      </Link>
      {crumbs.length > 1 && (
        <nav aria-label="Kde jsem" className="flex flex-wrap items-center gap-1 text-neutral-500">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>›</span>}
              {i === crumbs.length - 1 ? (
                <span className="font-medium text-neutral-800">{c.label}</span>
              ) : (
                <Link href={c.href} className="hover:text-begina-primary-900 hover:underline">
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}
    </div>
  );
}

function WithSearch({ fallback }: { fallback: string }) {
  const search = useSearchParams()?.toString() ?? "";
  return <Nav search={search} fallback={fallback} />;
}

export default function BackLink({ fallback }: { fallback: string }) {
  return (
    <Suspense fallback={<Nav search="" fallback={fallback} />}>
      <WithSearch fallback={fallback} />
    </Suspense>
  );
}
