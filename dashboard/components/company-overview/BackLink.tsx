"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parentHref } from "@/lib/navigation/parentHref";

const CLS = "inline-block text-sm font-medium text-neutral-500 hover:text-begina-primary-900 py-2";
const KEY = "mb-nav-depth";

// „← Zpět“ (Lucie 25. 11. 2026): vrací tam, odkud uživatel přišel – jako šipka
// zpět v prohlížeči (Řízení firmy → Ceník surovin → Zpět = Řízení firmy).
// Když v MojeBegina ještě žádný krok neudělal (otevřel odkaz rovnou), vrátí
// o úroveň výš podle adresy (lib/navigation/parentHref.ts).
function readDepth(): number {
  try {
    return Number(sessionStorage.getItem(KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}
function writeDepth(n: number) {
  try {
    sessionStorage.setItem(KEY, String(Math.max(0, n)));
  } catch {
    /* bez úložiště jen fallback podle adresy */
  }
}

function useBack(current: string | null) {
  const router = useRouter();
  useEffect(() => {
    if (current === null) return; // dočasná verze bez parametrů adresy nic nepočítá
    // každá nová stránka (i krok v adrese, např. Etikety) = jeden krok hlouběji
    const last = (() => {
      try {
        return sessionStorage.getItem(`${KEY}-last`);
      } catch {
        return null;
      }
    })();
    if (last !== current) {
      writeDepth(last === null ? 0 : readDepth() + 1);
      try {
        sessionStorage.setItem(`${KEY}-last`, current);
      } catch {
        /* nic */
      }
    }
  }, [current]);
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // nový panel = adresa
    if (readDepth() > 0) {
      e.preventDefault();
      writeDepth(readDepth() - 2); // po návratu se zase přičte 1
      router.back();
    }
  };
}

function BackLinkInner({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const href = parentHref(pathname, fallback, search);
  const onClick = useBack(`${pathname}?${search}`);
  return (
    <Link href={href} onClick={onClick} className={CLS}>
      ← Zpět
    </Link>
  );
}

function BackLinkNoSearch({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  const href = parentHref(pathname, fallback);
  const onClick = useBack(null);
  return (
    <Link href={href} onClick={onClick} className={CLS}>
      ← Zpět
    </Link>
  );
}

export default function BackLink({ fallback }: { fallback: string }) {
  return (
    <Suspense fallback={<BackLinkNoSearch fallback={fallback} />}>
      <BackLinkInner fallback={fallback} />
    </Suspense>
  );
}
