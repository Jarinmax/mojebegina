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
  it("texty z návrhu", () => {
    render(<HomeHero />);
    // nezalomitelné mezery (a&nbsp;bylinné) porovnáváme jako obyčejné
    const text = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");
    expect(text(document.body.textContent)).toContain("Čerstvě. Jednoduše. S chutí.");
    const h1 = screen.getByRole("heading", { level: 1 });
    // nadpis s hlavní výhodou – begina (11. 11. 2026)
    expect(text(h1.textContent)).toBe("Polévky a nápoje v begině");
    expect(text(document.body.textContent)).toContain("Natočíte si, kolik chcete a kdy chcete. 100 % rostlinné, z čisté filtrované vody.");
    expect(screen.getByText("Doručujeme chlazenou přepravou.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/poctiv|krabic|bag-in-box/i);
  });

  it("Vybrat polévku → Čerstvé polévky, Objevit sirupy → Bylinné sirupy (existující kategorie)", () => {
    render(<HomeHero />);
    expect(screen.getByRole("link", { name: "Vybrat polévku" }).getAttribute("href")).toBe("/eshop/kategorie/polevky");
    expect(screen.getByRole("link", { name: "Objevit sirupy" }).getAttribute("href")).toBe("/eshop/kategorie/sirupy");
    const slugs = HOME_CATEGORIES.map((c) => c.slug);
    expect(slugs).toContain("polevky");
    expect(slugs).toContain("sirupy");
    expect(existsSync(path.join(__dirname, "../../app/eshop/kategorie/[slug]/page.tsx"))).toBe(true);
  });

  it("fotografie úvodu (polévka, čaj, limonáda, begina, 11. 11. 2026) v plném poměru, existuje v public", () => {
    render(<HomeHero />);
    const img = screen.getByRole("img", { name: HERO_PHOTO.alt });
    expect(img.getAttribute("src")).toBe("/eshop/hero/polevka-a-napoje-v9.webp");
    expect(HERO_PHOTO.width / HERO_PHOTO.height).toBeCloseTo(1448 / 1126);
    expect(img.className).toContain("h-auto");
    expect(img.className).not.toMatch(/object-cover|rounded|shadow|border/);
    expect(existsSync(path.join(__dirname, "../../public", HERO_PHOTO.src))).toBe(true);
  });
});
