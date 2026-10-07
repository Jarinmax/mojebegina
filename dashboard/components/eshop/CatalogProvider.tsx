"use client";

// ESHOP 1.0 — katalog z DB pro klientské komponenty (košík, pokladna).
// Načte ho serverový layout e-shopu (getCatalog) a předá sem; prohlížeč
// nikdy nepoužívá jiný katalog než ten z DB.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createCatalogIndex, type CatalogIndex } from "@/lib/eshop/catalogIndex";
import type { Catalog } from "@/lib/eshop/types";

const CatalogContext = createContext<CatalogIndex | null>(null);

export default function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  const index = useMemo(() => createCatalogIndex(catalog), [catalog]);
  return <CatalogContext.Provider value={index}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogIndex {
  const index = useContext(CatalogContext);
  if (!index) {
    throw new Error("useCatalog() mimo CatalogProvider — e-shopové komponenty patří pod app/eshop/layout.tsx.");
  }
  return index;
}
