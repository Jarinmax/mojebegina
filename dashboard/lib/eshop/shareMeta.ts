// Náhled při sdílení odkazu (WhatsApp, Facebook, X, Messenger…) — 10. 11. 2026.
// Obrázek = originální logo Begina (B s červeným puntíkem) na bílém podkladu
// s velkými okraji, aby se neořízlo ani ve čtvercovém výřezu. Dřív se bez
// og:image ukazovala výchozí ikona Next.js/Vercel (černé kolečko s trojúhelníkem).
import type { Metadata } from "next";

export const SHARE_TITLE = "Begina – Když rozhoduje chuť";
export const SHARE_DESCRIPTION = "Čerstvé polévky, bylinkové sirupy, nápoje a zmrzliny. Objevte naši nabídku na begina.cz.";
/** Verze v adrese obrázku — po změně obrázku zvýšit (sítě si náhledy dlouho pamatují). */
const V = "2026-11-10";
export const SHARE_IMAGES = [
  { url: `/og-begina.png?v=${V}`, width: 1200, height: 630, alt: "Logo Begina — písmeno B s červeným puntíkem" },
  { url: `/og-begina-ctverec.png?v=${V}`, width: 1200, height: 1200, alt: "Logo Begina — písmeno B s červeným puntíkem" },
];

/** Výchozí Open Graph / Twitter pro celý e-shop (produkty mají vlastní). */
export function brandShareMeta(url = "/"): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "Begina",
      locale: "cs_CZ",
      url,
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: SHARE_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: [SHARE_IMAGES[0].url],
    },
  };
}

/**
 * Náhled odkazu pro konkrétní stránku (Lucie 20. 11. 2026): při sdílení např.
 * begina.cz/pro-kavarny se dřív ukazoval jen obecný titulek úvodní stránky.
 * Logo zůstává, titulek, popis a adresa jsou z dané stránky.
 */
export function pageShareMeta(title: string, description: string, path: string): Pick<Metadata, "openGraph" | "twitter"> {
  const shareTitle = `${title} | Begina`;
  return {
    openGraph: {
      type: "website",
      siteName: "Begina",
      locale: "cs_CZ",
      url: path,
      title: shareTitle,
      description,
      images: SHARE_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [SHARE_IMAGES[0].url],
    },
  };
}
