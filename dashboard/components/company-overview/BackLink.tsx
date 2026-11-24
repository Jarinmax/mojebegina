"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parentHref } from "@/lib/navigation/parentHref";

const CLS = "inline-block text-sm font-medium text-neutral-500 hover:text-begina-primary-900 py-2";

// „← Zpět" o jeden krok výš (viz lib/navigation/parentHref.ts); fallback je
// úvodní obrazovka role, kam se jde až z kořene sekce. U stránek s kroky
// v adrese (Etikety) vrací o jeden zvolený krok.
function BackLinkInner({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <Link href={parentHref(pathname, fallback, search?.toString())} className={CLS}>
      ← Zpět
    </Link>
  );
}

function BackLinkNoSearch({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  return (
    <Link href={parentHref(pathname, fallback)} className={CLS}>
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
