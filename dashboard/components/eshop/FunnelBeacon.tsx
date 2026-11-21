"use client";

// Anonymní měření kroků nákupu (lib/eshop/funnel.ts). Nic neukládá do
// zařízení (kromě cookie „nemerit“ týmu) a neposílá žádný údaj o
// návštěvníkovi — jen název kroku a zdroj návštěvy.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stepForPath } from "@/lib/eshop/funnel";
import { noteLanding, trackFunnel } from "@/lib/eshop/funnelClient";

export default function FunnelBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    trackFunnel("visit");
    noteLanding(document.referrer, window.location.search);
    const step = stepForPath(pathname ?? "/");
    if (step) trackFunnel(step);
  }, [pathname]);
  return null;
}
