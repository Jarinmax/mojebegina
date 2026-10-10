// @vitest-environment jsdom
// Cookie lišta: skript CookieYes jen se zapnutým přepínačem (komponenta se
// jinak nevykreslí) a nikdy na stránce objednávky; tlačítko „Nastavení cookies“.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/produkt/kulajda" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import Marketing from "../eshop/Marketing";
import EshopFooter from "../eshop/EshopFooter";

const CONFIG = { cookieYesId: "5f3760f1f9ac1d11074e41aade2c6467", metaPixelId: "2509610956071494" };

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  delete (window as { fbq?: unknown }).fbq;
});

describe("Marketing", () => {
  it("načte CookieYes; Meta Pixel bez souhlasu ne", () => {
    window.history.pushState({}, "", "/produkt/kulajda");
    render(<Marketing config={CONFIG} />);
    const scripts = [...document.head.querySelectorAll("script")].map((s) => s.src);
    expect(scripts).toEqual([`https://cdn-cookieyes.com/client_data/${CONFIG.cookieYesId}/script.js`]);
    expect((window as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it("stránka objednávky: žádný CookieYes ani pixel", () => {
    window.history.pushState({}, "", "/objednavka/0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11");
    nav.pathname = "/objednavka/0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11";
    document.cookie = "cookieyes-consent=advertisement:yes";
    render(<Marketing config={CONFIG} />);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
    document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("patička: „Nastavení cookies“ jen se zapnutou lištou", () => {
    const { rerender } = render(<EshopFooter />);
    expect(screen.queryByRole("button", { name: "Nastavení cookies" })).toBeNull();
    rerender(<EshopFooter cookieSettings />);
    expect(screen.getByRole("button", { name: "Nastavení cookies" }).className).toContain("cky-banner-element");
  });
});
