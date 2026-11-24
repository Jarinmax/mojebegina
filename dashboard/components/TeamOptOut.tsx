"use client";
// MĚŘENÍ E-SHOPU (24. 11. 2026, Lucie): kdo z týmu otevře Řízení firmy,
// administraci nebo pracovní karty, toho prohlížeč se z měření e-shopu
// vyřadí sám — cookie „begina_nemerit“ pro celé begina.cz (i www a moje).
// Zákaznická zóna Moje Begina tohle NEdělá, zákazníci se dál počítají.
import { useEffect } from "react";
import { OPT_OUT_COOKIE } from "@/lib/eshop/funnel";

export default function TeamOptOut() {
  useEffect(() => {
    try {
      const domain = window.location.hostname.endsWith("begina.cz") ? "; Domain=.begina.cz" : "";
      document.cookie = `${OPT_OUT_COOKIE}=1; Max-Age=${60 * 60 * 24 * 400}; Path=/; SameSite=Lax; Secure${domain}`;
    } catch {
      // cookie nejde nastavit (soukromý režim) — nevadí
    }
  }, []);
  return null;
}
