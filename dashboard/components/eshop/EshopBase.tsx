"use client";

// Základ odkazů e-shopu pro klientské komponenty ("" na begina.cz,
// "/eshop" jinde) — nastavuje app/eshop/layout.tsx podle proxy.ts.
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { eshopHref, INTERNAL_ESHOP_BASE, type EshopBase } from "@/lib/eshop/paths";

const EshopBaseContext = createContext<EshopBase>(INTERNAL_ESHOP_BASE);

export function EshopBaseProvider({ base, children }: { base: EshopBase; children: ReactNode }) {
  return <EshopBaseContext.Provider value={base}>{children}</EshopBaseContext.Provider>;
}

/** (cesta) => odkaz pro aktuální doménu, např. href("/kosik"). */
export function useEshopHref(): (path: string) => string {
  const base = useContext(EshopBaseContext);
  return useCallback((path: string) => eshopHref(base, path), [base]);
}
