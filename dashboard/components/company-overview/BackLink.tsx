"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { parentHref } from "@/lib/navigation/parentHref";

// „← Zpět" o jeden krok výš (viz lib/navigation/parentHref.ts); fallback je
// úvodní obrazovka role, kam se jde až z kořene sekce.
export default function BackLink({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  return (
    <Link href={parentHref(pathname, fallback)} className="inline-block text-sm font-medium text-neutral-500 hover:text-begina-primary-900 py-2">
      ← Zpět
    </Link>
  );
}
