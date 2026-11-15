"use client";

// Anonymní měření kroků nákupu (lib/eshop/funnel.ts). Nic neukládá do
// zařízení a neposílá žádný údaj o návštěvníkovi — jen název kroku.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stepForPath } from "@/lib/eshop/funnel";
import { trackFunnel } from "@/lib/eshop/funnelClient";

export default function FunnelBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    trackFunnel("visit");
    const step = stepForPath(pathname ?? "/");
    if (step) trackFunnel(step);
  }, [pathname]);
  return null;
}
