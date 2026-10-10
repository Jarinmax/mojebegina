"use client";

// Cookie lišta CookieYes + Meta Pixel (jen se souhlasem). Vykreslí se jen
// při zapnutém přepínači (lib/eshop/marketing.ts → app/eshop/layout.tsx).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cookieYesScriptUrl, isPrivateEshopPath, type MarketingConfig } from "@/lib/eshop/marketing";
import { createMetaPixel, readAdConsent, setActiveMetaPixel, type MetaPixel } from "@/lib/eshop/metaPixel";

const CONSENT_EVENTS = ["cookieyes_consent_update", "cookieyes_banner_load"] as const;

let pixel: MetaPixel | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function Marketing({ config }: { config: MarketingConfig }) {
  const pathname = usePathname();

  useEffect(() => {
    // CookieYes: jednou za načtení stránky, ne na stránce objednávky.
    if (!document.getElementById("cookieyes") && !isPrivateEshopPath(window.location.pathname)) {
      const script = document.createElement("script");
      script.id = "cookieyes";
      script.src = cookieYesScriptUrl(config.cookieYesId);
      document.head.appendChild(script);
    }
    if (!config.metaPixelId) return;
    pixel ??= createMetaPixel(config.metaPixelId, { window, document, storage: storage() });
    setActiveMetaPixel(pixel);
    const sync = () => pixel?.setConsent(readAdConsent({ window, document }));
    sync();
    for (const name of CONSENT_EVENTS) document.addEventListener(name, sync);
    return () => {
      for (const name of CONSENT_EVENTS) document.removeEventListener(name, sync);
    };
  }, [config.cookieYesId, config.metaPixelId]);

  useEffect(() => {
    pixel?.pageView(pathname);
  }, [pathname]);

  return null;
}
