// Odkazy e-shopu podle domény (lib/eshop/paths.ts) a pojistka, že kód
// e-shopu nepíše cesty „/eshop/…“ natvrdo (jinak by na begina.cz vedly
// na přesměrování nebo 404).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseForSite, eshopAbsoluteUrl, eshopHref, orderStatusPath } from "../paths";
import { buildCheckoutSessionParams } from "../stripe/payment";

const ROOT = path.join(__dirname, "../../..");
const ORDER_ID = "11348d18-506f-45b8-b65d-65df779471c7";

afterEach(() => vi.unstubAllEnvs());

describe("eshopHref", () => {
  it("begina.cz bez prefixu, jinde /eshop; kořen", () => {
    expect(eshopHref(baseForSite("public"), "/produkt/kulajda")).toBe("/produkt/kulajda");
    expect(eshopHref(baseForSite("internal"), "/produkt/kulajda")).toBe("/eshop/produkt/kulajda");
    expect(eshopHref("", "/")).toBe("/");
    expect(eshopHref("/eshop", "/")).toBe("/eshop");
    expect(eshopHref("", "/kosik?x=1")).toBe("/kosik?x=1");
    expect(() => eshopHref("", "kosik")).toThrow();
  });
});

describe("úplné adresy do e-mailů a pro návrat ze Stripe", () => {
  it("výchozí stav (bez přepínače): jako dosud <adresa aplikace>/eshop/objednavka/<id>", () => {
    expect(eshopAbsoluteUrl("https://moje.begina.cz", orderStatusPath(ORDER_ID), {})).toBe(
      `https://moje.begina.cz/eshop/objednavka/${ORDER_ID}`
    );
    expect(eshopAbsoluteUrl("https://preview.example/", "/", {})).toBe("https://preview.example/eshop");
  });

  it("požadavek přes begina.cz → https://begina.cz bez /eshop (i bez přepínače)", () => {
    expect(eshopAbsoluteUrl("https://begina.cz", orderStatusPath(ORDER_ID), {})).toBe(`https://begina.cz/objednavka/${ORDER_ID}`);
    expect(eshopAbsoluteUrl("http://begina.cz:3100", "/kosik", {})).toBe("https://begina.cz/kosik");
  });

  it("ESHOP_CANONICAL_ORIGIN → vždy https://begina.cz (e-mail i Stripe), Preview ho ignoruje", () => {
    const on = { ESHOP_CANONICAL_ORIGIN: "https://begina.cz" };
    expect(eshopAbsoluteUrl("https://moje.begina.cz", orderStatusPath(ORDER_ID), on)).toBe(`https://begina.cz/objednavka/${ORDER_ID}`);
    expect(eshopAbsoluteUrl("https://x.vercel.app", "/", { ...on, VERCEL_ENV: "preview" })).toBe("https://x.vercel.app/eshop");
    expect(eshopAbsoluteUrl("https://moje.begina.cz", "/", { ESHOP_CANONICAL_ORIGIN: "https://evil.cz" })).toBe("https://moje.begina.cz/eshop");
  });

  it("Stripe Checkout: návrat na stránku objednávky podle přepínače", () => {
    const order = {
      id: ORDER_ID,
      orderNumber: 900001,
      paymentVs: "70000001",
      channel: "eshop",
      paymentStatus: "unpaid",
      fulfillmentStatus: "new",
      paymentMethodCode: "karta",
      contactEmail: "jana@example.cz",
      totalKc: 758,
      shippingKc: 0,
      shippingMethodLabel: null,
      items: [{ name: "Kulajda", quantity: 2, unitPriceKc: 379 }],
    } as unknown as Parameters<typeof buildCheckoutSessionParams>[0];
    expect(buildCheckoutSessionParams(order, "https://moje.begina.cz").success_url).toBe(
      `https://moje.begina.cz/eshop/objednavka/${ORDER_ID}?platba=ok`
    );
    vi.stubEnv("ESHOP_CANONICAL_ORIGIN", "https://begina.cz");
    const params = buildCheckoutSessionParams(order, "https://moje.begina.cz");
    expect(params.success_url).toBe(`https://begina.cz/objednavka/${ORDER_ID}?platba=ok`);
    expect(params.cancel_url).toBe(`https://begina.cz/objednavka/${ORDER_ID}?platba=zrusena`);
  });
});

describe("pojistka: žádné cesty /eshop natvrdo v kódu e-shopu", () => {
  function files(dir: string): string[] {
    return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      if (name === "__tests__") return [];
      return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : [rel];
    });
  }

  it("odkaz na stránku e-shopu jen přes ShopLink / eshopHref / eshopAbsoluteUrl (statické soubory /eshop/*.jpg smí)", () => {
    const sources = ["app/eshop", "components/eshop", "lib/eshop"]
      .flatMap(files)
      .filter((f) => /\.tsx?$/.test(f) && f !== "lib/eshop/paths.ts");
    // řetězec začínající /eshop, který NENÍ statický soubor (…/název.přípona)
    const ROUTE_LITERAL = /["'`]\/eshop(?!\/(?:[\w-]+\/)*[\w.-]+\.(?:jpe?g|png|webp|avif|gif|svg|ico)["'`])(?=[/"'`?$])/g;
    const offenders = sources.flatMap((file) => {
      const code = readFileSync(path.join(ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        // typy rout (PageProps<"/eshop/…">) nejsou odkazy
        .replace(/(?:PageProps|LayoutProps)<"[^"]*">/g, "");
      return [...code.matchAll(ROUTE_LITERAL)].map((m) => `${file}: ${code.slice(m.index!, m.index! + 40)}`);
    });
    expect(offenders).toEqual([]);
  });
});
