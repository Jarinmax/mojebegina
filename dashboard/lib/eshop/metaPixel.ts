// Meta Pixel v prohlížeči — jen se souhlasem s reklamními cookies (CookieYes,
// kategorie „advertisement“). Bez souhlasu se skript Meta vůbec nenačte
// a nic se neodešle; po odvolání souhlasu se další události neodešlou.
// Nákup (Purchase) prohlížeč NEposílá — vytvořená objednávka ještě není
// zaplacená. Dokončený nákup posílá server po úplné úhradě
// (lib/eshop/metaPurchase.ts); pokladna k objednávce jen uloží souhlas
// a identifikátory prohlížeče (checkoutMetaSignals níže).
import { isPrivateEshopPath } from "./marketing";

export const META_SCRIPT_URL = "https://connect.facebook.net/en_US/fbevents.js";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: unknown;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

type PixelWindow = {
  fbq?: Fbq;
  _fbq?: Fbq;
  getCkyConsent?: () => { categories?: Record<string, boolean> } | undefined;
  location: { pathname: string };
};

export type PixelEnv = {
  window: PixelWindow;
  document: Pick<Document, "cookie" | "createElement" | "head">;
};

/** Souhlas s reklamními cookies z CookieYes (API, jinak cookie „cookieyes-consent“). */
export function readAdConsent(env: Pick<PixelEnv, "window" | "document">): boolean {
  try {
    const categories = env.window.getCkyConsent?.()?.categories;
    if (categories && typeof categories.advertisement === "boolean") return categories.advertisement;
  } catch {
    // API CookieYes ještě není načtené — zkusit cookie
  }
  const raw = env.document.cookie.split(/;\s*/).find((part) => part.startsWith("cookieyes-consent="));
  if (!raw) return false;
  const value = decodeURIComponent(raw.slice("cookieyes-consent=".length));
  return value.split(",").includes("advertisement:yes");
}

function cookie(doc: Pick<Document, "cookie">, name: string): string {
  const raw = doc.cookie.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : "";
}

/**
 * Pro pokladnu: souhlas s reklamními cookies a identifikátory prohlížeče
 * od Meta (_fbp, _fbc — vznikají jen po souhlasu, když se pixel načte).
 * Server je uloží k objednávce a po úplném zaplacení podle nich pošle nákup.
 */
export function checkoutMetaSignals(env: Pick<PixelEnv, "window" | "document">): { adConsent: string; fbp: string; fbc: string } {
  if (!readAdConsent(env)) return { adConsent: "0", fbp: "", fbc: "" };
  return { adConsent: "1", fbp: cookie(env.document, "_fbp"), fbc: cookie(env.document, "_fbc") };
}

export type MetaPixel = {
  setConsent(granted: boolean): void;
  pageView(pathname: string): void;
  track(event: string, params: Record<string, unknown>): void;
};

export function createMetaPixel(pixelId: string, env: PixelEnv): MetaPixel {
  let consent = false;
  let loaded = false;
  let lastPageView: string | null = null;
  let currentPath: string | null = null;

  function load() {
    if (loaded) return;
    loaded = true;
    const w = env.window;
    if (!w.fbq) {
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue.push(args);
      } as Fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.queue = [];
      w.fbq = fbq;
      if (!w._fbq) w._fbq = fbq;
      const script = env.document.createElement("script");
      script.async = true;
      script.src = META_SCRIPT_URL;
      env.document.head.appendChild(script);
    }
    // Žádné automatické události Meta (kliknutí, změny adresy) — jen ty naše.
    w.fbq!.disablePushState = true;
    w.fbq!("set", "autoConfig", false, pixelId);
    w.fbq!("init", pixelId);
  }

  function allowed(): boolean {
    return consent && !isPrivateEshopPath(env.window.location.pathname);
  }

  function send(event: string, params?: Record<string, unknown>, eventId?: string) {
    load();
    const args: unknown[] = ["track", event];
    if (params) args.push(params);
    if (eventId) args.push({ eventID: eventId });
    env.window.fbq!(...args);
  }

  function pageView(pathname: string) {
    currentPath = pathname;
    if (!allowed() || isPrivateEshopPath(pathname) || lastPageView === pathname) return;
    lastPageView = pathname;
    send("PageView");
  }

  return {
    setConsent(granted) {
      if (granted === consent) return;
      consent = granted;
      if (!granted) {
        if (loaded) env.window.fbq?.("consent", "revoke");
        return;
      }
      if (loaded) env.window.fbq?.("consent", "grant");
      // Souhlas udělený na právě otevřené stránce → její zobrazení se započítá.
      if (currentPath !== null) {
        lastPageView = null;
        pageView(currentPath);
      }
    },
    pageView,
    track(event, params) {
      if (!allowed()) return;
      send(event, { currency: "CZK", ...params });
    },
  };
}

// Jediná instance pro stránku (nastaví ji components/eshop/Marketing.tsx).
// Bez ní (přepínač vypnutý) jsou všechny volání níže bez účinku.
let active: MetaPixel | null = null;

export function setActiveMetaPixel(pixel: MetaPixel | null) {
  active = pixel;
}

export function trackMeta(event: string, params: Record<string, unknown>) {
  active?.track(event, params);
}
