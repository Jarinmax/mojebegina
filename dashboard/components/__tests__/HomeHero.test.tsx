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
  it("texty a odkazy z návrhu (22. 11. 2026)", () => {
    render(<HomeHero />);
    const text = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(text(h1.textContent)).toBe("Polévky a nápoje pro kavárny a bistra");
    const body = text(document.body.textContent);
    expect(body).toContain("Polévku stačí ohřát, sirup naředit.");
    expect(body).toContain("Doručíme chlazeně po celé ČR.");
    expect(body).toContain("K první třílitrové begině na IČO přibalíme 2 vzorky polévek a 2 vzorky sirupů zdarma.");
    expect(screen.getByRole("link", { name: /Vybrat první balení/ }).getAttribute("href")).toBe("/eshop/pro-kavarny#ochutnavka");
    expect(screen.getByRole("link", { name: /Domluvit dodávky po telefonu/ }).getAttribute("href")).toBe("/eshop/pro-kavarny#napiste-nam");
    expect(document.body.textContent).not.toMatch(/poctiv|krabic|bag-in-box|dovážíme/i);
  });

  it.skip("rychlý nákup: Vybrat polévku a Objevit sirupy (odebráno 22. 11. 2026 — dělají to dlaždice kategorií)", () => {
    render(<HomeHero />);
    expect(screen.getByRole("link", { name: /Vybrat polévku/ }).getAttribute("href")).toBe("/eshop/kategorie/polevky");
    expect(screen.getByRole("link", { name: "Objevit sirupy" }).getAttribute("href")).toBe("/eshop/kategorie/sirupy");
    const slugs = HOME_CATEGORIES.map((c) => c.slug);
    expect(slugs).toContain("polevky");
    expect(existsSync(path.join(__dirname, "../../app/eshop/kategorie/[slug]/page.tsx"))).toBe(true);
  });

  it("fotografie úvodu (polévka, čaj, limonáda, begina, 11. 11. 2026) v plném poměru, existuje v public", () => {
    render(<HomeHero />);
    const img = screen.getByRole("img", { name: HERO_PHOTO.alt });
    expect(img.getAttribute("src")).toBe("/eshop/hero/polevka-kavarna-v14.webp");
    expect(HERO_PHOTO.width / HERO_PHOTO.height).toBeCloseTo(1670 / 941);
    expect(img.className).toContain("h-auto");
    // od v13 (19. 11. 2026) je fotka v rámečku se zaoblenými rohy, ale nikdy se neořezává
    expect(img.className).not.toMatch(/object-cover/);
    expect(img.className).toContain("rounded-2xl");
    expect(existsSync(path.join(__dirname, "../../public", HERO_PHOTO.src))).toBe(true);
  });
});
