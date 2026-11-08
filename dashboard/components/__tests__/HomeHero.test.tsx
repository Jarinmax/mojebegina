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
    expect(screen.getByText("Čerstvě. Jednoduše. S chutí.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Čerstvé polévky a bylinné sirupy");
    expect(screen.getByText("Z pečlivě vybraných surovin a čisté filtrované vody.")).toBeTruthy();
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

  it("skutečná fotografie v plném poměru 3 : 2, existuje v public", () => {
    render(<HomeHero />);
    const img = screen.getByRole("img", { name: HERO_PHOTO.alt });
    expect(img.getAttribute("src")).toBe("/eshop/hero/polevka-a-bylinny-napoj.webp");
    expect(HERO_PHOTO.width / HERO_PHOTO.height).toBeCloseTo(1.5);
    expect(img.className).toContain("h-auto");
    expect(img.className).not.toMatch(/object-cover/);
    expect(existsSync(path.join(__dirname, "../../public", HERO_PHOTO.src))).toBe(true);
  });
});
