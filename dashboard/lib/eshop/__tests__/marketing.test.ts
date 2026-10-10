// Meta Pixel + CookieYes: přepínače (výchozí vypnuto), žádná událost bez
// souhlasu s reklamními cookies, nic na stránce objednávky, nákup jednou.
import { describe, expect, it } from "vitest";
import { cookieYesScriptUrl, isPrivateEshopPath, marketingConfig, purchaseEvent } from "../marketing";
import { createMetaPixel, META_SCRIPT_URL, readAdConsent, type PixelEnv } from "../metaPixel";

const CKY = "5f3760f1f9ac1d11074e41aade2c6467";
const PIXEL = "2509610956071494";

describe("přepínače", () => {
  it("výchozí stav = vypnuto; zapne jen ESHOP_MARKETING=on s platným kódem CookieYes", () => {
    expect(marketingConfig({})).toBeNull();
    expect(marketingConfig({ ESHOP_COOKIEYES_ID: CKY, ESHOP_META_PIXEL_ID: PIXEL })).toBeNull();
    expect(marketingConfig({ ESHOP_MARKETING: "1", ESHOP_COOKIEYES_ID: CKY })).toBeNull();
    expect(marketingConfig({ ESHOP_MARKETING: "on" })).toBeNull();
    expect(marketingConfig({ ESHOP_MARKETING: "on", ESHOP_COOKIEYES_ID: "x" })).toBeNull();
    expect(marketingConfig({ ESHOP_MARKETING: "on", ESHOP_COOKIEYES_ID: CKY })).toEqual({ cookieYesId: CKY, metaPixelId: null });
    expect(marketingConfig({ ESHOP_MARKETING: "on", ESHOP_COOKIEYES_ID: CKY, ESHOP_META_PIXEL_ID: PIXEL })).toEqual({
      cookieYesId: CKY,
      metaPixelId: PIXEL,
    });
    expect(marketingConfig({ ESHOP_MARKETING: "on", ESHOP_COOKIEYES_ID: CKY, ESHOP_META_PIXEL_ID: "<script>" })).toEqual({
      cookieYesId: CKY,
      metaPixelId: null,
    });
    expect(cookieYesScriptUrl(CKY)).toBe(`https://cdn-cookieyes.com/client_data/${CKY}/script.js`);
  });

  it("stránka objednávky je soukromá na obou doménách", () => {
    expect(isPrivateEshopPath("/objednavka/0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11")).toBe(true);
    expect(isPrivateEshopPath("/eshop/objednavka/0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11")).toBe(true);
    expect(isPrivateEshopPath("/produkt/kulajda")).toBe(false);
    expect(isPrivateEshopPath("/pokladna")).toBe(false);
  });
});

describe("nákup ze serveru", () => {
  const cart = { totalKc: 1476, lines: [{ sku: "kulajda", quantity: 2, unitPriceKc: 379 } as never] };
  it("jen nově uložená objednávka s VS; event_id podle VS (ne podle tajného id objednávky)", () => {
    expect(purchaseEvent({ paymentVs: "70000002", alreadySaved: false }, cart)).toEqual({
      eventId: "objednavka-70000002",
      valueKc: 1476,
      contents: [{ id: "kulajda", quantity: 2, item_price: 379 }],
    });
    expect(purchaseEvent({ paymentVs: "70000002", alreadySaved: true }, cart)).toBeNull();
    expect(purchaseEvent({ paymentVs: null, alreadySaved: false }, cart)).toBeNull();
  });
});

function fakeEnv(path = "/produkt/kulajda", cookie = "") {
  const calls: unknown[][] = [];
  const scripts: string[] = [];
  const store = new Map<string, string>();
  const env: PixelEnv = {
    window: { location: { pathname: path } },
    document: {
      cookie,
      createElement: () => ({}) as HTMLScriptElement,
      head: { appendChild: (el: { src: string }) => scripts.push(el.src) } as never,
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
  };
  // fbevents.js se nenačte — fronta stubu = co by Meta dostala
  const sent = () => (env.window.fbq?.queue ?? []).map((args) => [...(args as unknown[])]);
  return { env, calls, scripts, store, sent };
}

const purchase = { eventId: "objednavka-70000002", valueKc: 758, contents: [{ id: "kulajda", quantity: 2, item_price: 379 }] };

describe("Meta Pixel v prohlížeči", () => {
  it("souhlas čte z CookieYes (API, jinak cookie) — jen kategorie advertisement", () => {
    const { env } = fakeEnv("/", "cookieyes-consent=consentid:x,consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no");
    expect(readAdConsent(env)).toBe(false);
    env.document.cookie = "a=1; cookieyes-consent=consentid%3Ax%2Cadvertisement%3Ayes";
    expect(readAdConsent(env)).toBe(true);
    env.window.getCkyConsent = () => ({ categories: { advertisement: false } });
    expect(readAdConsent(env)).toBe(false);
    expect(readAdConsent(fakeEnv().env)).toBe(false);
  });

  it("bez souhlasu se skript Meta nenačte a nic se neodešle", () => {
    const { env, scripts } = fakeEnv();
    const pixel = createMetaPixel(PIXEL, env);
    pixel.pageView("/produkt/kulajda");
    pixel.track("AddToCart", { value: 379 });
    expect(pixel.trackPurchase(purchase)).toBe(false);
    expect(scripts).toEqual([]);
    expect(env.window.fbq).toBeUndefined();
  });

  it("po souhlasu: skript Meta, bez automatických událostí, PageView otevřené stránky a události e-shopu", () => {
    const { env, scripts, sent } = fakeEnv();
    const pixel = createMetaPixel(PIXEL, env);
    pixel.pageView("/produkt/kulajda");
    pixel.setConsent(true);
    pixel.track("ViewContent", { content_ids: ["kulajda"], value: 379 });
    expect(scripts).toEqual([META_SCRIPT_URL]);
    expect(env.window.fbq?.disablePushState).toBe(true);
    expect(sent()).toEqual([
      ["set", "autoConfig", false, PIXEL],
      ["init", PIXEL],
      ["track", "PageView"],
      ["track", "ViewContent", { currency: "CZK", content_ids: ["kulajda"], value: 379 }],
    ]);
    pixel.pageView("/produkt/kulajda"); // stejná stránka znovu (re-render) = nic
    expect(sent()).toHaveLength(4);
  });

  it("nákup jen jednou: znovu na stránce, po obnovení stránky (localStorage) i u Meta (eventID)", () => {
    const { env, sent, store } = fakeEnv("/pokladna");
    const pixel = createMetaPixel(PIXEL, env);
    pixel.setConsent(true);
    expect(pixel.trackPurchase(purchase)).toBe(true);
    expect(pixel.trackPurchase(purchase)).toBe(false);
    const purchases = sent().filter((args) => args[1] === "Purchase");
    expect(purchases).toEqual([
      [
        "track",
        "Purchase",
        {
          currency: "CZK",
          value: 758,
          content_type: "product",
          content_ids: ["kulajda"],
          contents: [{ id: "kulajda", quantity: 2, item_price: 379 }],
          num_items: 2,
        },
        { eventID: "objednavka-70000002" },
      ],
    ]);
    // nová stránka (obnovení) se stejným úložištěm
    const again = fakeEnv("/pokladna");
    again.env.storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
    const reloaded = createMetaPixel(PIXEL, again.env);
    reloaded.setConsent(true);
    expect(reloaded.trackPurchase(purchase)).toBe(false);
    expect(again.sent().filter((args) => args[1] === "Purchase")).toEqual([]);
  });

  it("odvolání souhlasu: revoke a žádné další události", () => {
    const { env, sent } = fakeEnv();
    const pixel = createMetaPixel(PIXEL, env);
    pixel.setConsent(true);
    pixel.pageView("/produkt/kulajda");
    pixel.setConsent(false);
    pixel.track("AddToCart", { value: 1 });
    pixel.pageView("/kosik");
    expect(sent().slice(-1)).toEqual([["consent", "revoke"]]);
    expect(sent().filter((args) => args[0] === "track")).toEqual([["track", "PageView"]]);
  });

  it("stránka objednávky: nic se neodešle ani se souhlasem", () => {
    const { env, scripts } = fakeEnv("/objednavka/0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11");
    const pixel = createMetaPixel(PIXEL, env);
    pixel.setConsent(true);
    pixel.pageView("/objednavka/0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11");
    pixel.track("ViewContent", {});
    expect(pixel.trackPurchase(purchase)).toBe(false);
    expect(scripts).toEqual([]);
  });
});
