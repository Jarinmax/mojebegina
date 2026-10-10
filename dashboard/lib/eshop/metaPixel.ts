// Meta Pixel v prohlížeči — jen se souhlasem s reklamními cookies (CookieYes,
// kategorie „advertisement“). Bez souhlasu se skript Meta vůbec nenačte
// a nic se neodešle; po odvolání souhlasu se další události neodešlou.
// Nákup (Purchase) jen jednou: server ho pošle jen u nově uložené objednávky,
// prohlížeč si ho pamatuje (localStorage) a Meta ho deduplikuje podle eventID.
import { isPrivateEshopPath, type PurchaseEvent } from "./marketing";

export const META_SCRIPT_URL = "https://connect.facebook.net/en_US/fbevents.js";
const PURCHASE_KEY = "begina-meta-purchase:";

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
  storage: Pick<Storage, "getItem" | "setItem"> | null;
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

export type MetaPixel = {
  setConsent(granted: boolean): void;
  pageView(pathname: string): void;
  track(event: string, params: Record<string, unknown>): void;
  trackPurchase(purchase: PurchaseEvent): boolean;
};

export function createMetaPixel(pixelId: string, env: PixelEnv): MetaPixel {
  let consent = false;
  let loaded = false;
  let lastPageView: string | null = null;
  let currentPath: string | null = null;
  const sentPurchases = new Set<string>();

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
    trackPurchase(purchase) {
      if (!allowed() || sentPurchases.has(purchase.eventId)) return false;
      const key = PURCHASE_KEY + purchase.eventId;
      try {
        if (env.storage?.getItem(key)) return false;
        env.storage?.setItem(key, String(Date.now()));
      } catch {
        // úložiště zakázané — zůstává paměť stránky a deduplikace u Meta (eventID)
      }
      sentPurchases.add(purchase.eventId);
      send(
        "Purchase",
        {
          currency: "CZK",
          value: purchase.valueKc,
          content_type: "product",
          content_ids: purchase.contents.map((c) => c.id),
          contents: purchase.contents,
          num_items: purchase.contents.reduce((sum, c) => sum + c.quantity, 0),
        },
        purchase.eventId
      );
      return true;
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

export function trackMetaPurchase(purchase: PurchaseEvent | null | undefined): boolean {
  return purchase ? (active?.trackPurchase(purchase) ?? false) : false;
}
