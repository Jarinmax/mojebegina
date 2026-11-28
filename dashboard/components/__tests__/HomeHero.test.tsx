// @vitest-environment jsdom
// Úvod e-shopu podle návrhu 8. 11. 2026: texty, dvě funkční tlačítka na
// kategorie, skutečná fotografie (žádná krabice), bez slova „poctivé“.
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, @typescript-eslint/no-explicit-any
  default: ({ priority: _p, ...props }: any) => <img {...props} />,
}));

import HomeHero, { HERO_PHOTO } from "../eshop/HomeHero";
import { HOME_CATEGORIES } from "@/lib/eshop/homeNav";

afterEach(() => cleanup());

describe("úvod e-shopu", () => {
  it("texty a odkazy nové úvodní stránky (28. 11. 2026)", () => {
    render(<HomeHero />);
    const text = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(text(h1.textContent)).toBe("Vy jen ohřejete, hosté to pochválí.");
    const body = text(document.body.textContent);
    expect(body).toContain("Hotové polévky, bylinkové sirupy a další nápoje z kohoutku. Posíláme chlazeně po celé ČR.");
    expect(body).toContain("K první begině Vám přibalíme 2 vzorky polévek a 2 vzorky sirupů zdarma.");
    expect(screen.getByRole("link", { name: /Vybrat první beginu 3 l/ }).getAttribute("href")).toBe("/eshop/pro-kavarny#vyber-beginy");
    expect(screen.getByRole("link", { name: /Nebo nejdřív ochutnat 3 polévky za 299 Kč/ }).getAttribute("href")).toBe("/eshop/produkt/ochutnavka-polevek-3x450");
    // jen jedno tlačítko a jeden drobný odkaz
    expect(screen.getAllByRole("link")).toHaveLength(2);
    // 28. 11. 2026: krabice na fotce → popisek pod fotkou
    expect(body).toContain("Krabici k begině si můžete přikoupit v košíku za 19 Kč. Sirupy posíláme v krabici vždy.");
    expect(body).not.toMatch(/poctiv|bag-in-box|dovážíme/i);
  });

  it.skip("rychlý nákup: Vybrat polévku a Objevit sirupy (odebráno 22. 11. 2026 — dělají to dlaždice kategorií)", () => {
    render(<HomeHero />);
    expect(screen.getByRole("link", { name: /Vybrat polévku/ }).getAttribute("href")).toBe("/eshop/kategorie/polevky");
    expect(screen.getByRole("link", { name: "Objevit sirupy" }).getAttribute("href")).toBe("/eshop/kategorie/sirupy");
    const slugs = HOME_CATEGORIES.map((c) => c.slug);
    expect(slugs).toContain("polevky");
    expect(existsSync(path.join(__dirname, "../../app/eshop/kategorie/[slug]/page.tsx"))).toBe(true);
  });

  it("fotografie úvodu (v15, 28. 11. 2026) v plném poměru, existuje v public", () => {
    render(<HomeHero />);
    const img = screen.getByRole("img", { name: HERO_PHOTO.alt });
    expect(img.getAttribute("src")).toBe("/eshop/hero/dynova-z-krabice-kavarna-v16.webp");
    expect(HERO_PHOTO.width / HERO_PHOTO.height).toBeCloseTo(1672 / 941);
    expect(img.className).toContain("h-auto");
    // od v13 (19. 11. 2026) je fotka v rámečku se zaoblenými rohy, ale nikdy se neořezává
    // na mobilu celá fotka (h-auto); na počítači nižší pruh 26rem s ořezem jen nahoře a dole (Lucie 28. 11. 2026)
    expect(img.className).not.toMatch(/object-cover/);
    expect(img.className).toContain("lg:rounded-2xl");
    expect(existsSync(path.join(__dirname, "../../public", HERO_PHOTO.src))).toBe(true);
  });
});
