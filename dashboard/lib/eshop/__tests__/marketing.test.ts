// Meta Pixel + CookieYes: přepínače (výchozí vypnuto), žádná událost bez
// souhlasu s reklamními cookies, nic na stránce objednávky. Nákup (Purchase)
// prohlížeč neposílá vůbec — až server po zaplacení (metaPurchase.test.ts).
import { describe, expect, it } from "vitest";
import { cookieYesScriptUrl, isPrivateEshopPath, marketingConfig } from "../marketing";
import { checkoutMetaSignals, createMetaPixel, META_SCRIPT_URL, readAdConsent, type PixelEnv } from "../metaPixel";

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

function fakeEnv(path = "/produkt/kulajda", cookie = "") {
  const calls: unknown[][] = [];
  const scripts: string[] = [];
  const env: PixelEnv = {
    window: { location: { pathname: path } },
    document: {
      cookie,
      createElement: () => ({}) as HTMLScriptElement,
      head: { appendChild: (el: { src: string }) => scripts.push(el.src) } as never,
    },
  };
  // fbevents.js se nenačte — fronta stubu = co by Meta dostala
  const sent = () => (env.window.fbq?.queue ?? []).map((args) => [...(args as unknown[])]);
  return { env, calls, scripts, sent };
}

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

  it("pokladna: souhlas a _fbp/_fbc jen se souhlasem; prohlížeč nákup neposílá", () => {
    const { env } = fakeEnv("/pokladna", "_fbp=fb.1.1728561234567.1234567890; _fbc=fb.1.1728561234567.AbC");
    expect(checkoutMetaSignals(env)).toEqual({ adConsent: "0", fbp: "", fbc: "" });
    env.document.cookie += "; cookieyes-consent=advertisement:yes";
    expect(checkoutMetaSignals(env)).toEqual({ adConsent: "1", fbp: "fb.1.1728561234567.1234567890", fbc: "fb.1.1728561234567.AbC" });
    const pixel = createMetaPixel(PIXEL, env) as unknown as Record<string, unknown>;
    expect(pixel.trackPurchase).toBeUndefined();
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
    expect(scripts).toEqual([]);
  });
});
