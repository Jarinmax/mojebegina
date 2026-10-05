// @vitest-environment jsdom
// Kolotoč pod stránkami e-shopu: posun dokola, šipky, tečky, pauza; co ukazuje která stránka.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import EshopCarousel from "../eshop/EshopCarousel";
import { categoryCarousel, waterCarousel, WATER_DRINKS, type CarouselTile } from "@/lib/eshop/pageCarousel";
import type { Catalog, Product } from "@/lib/eshop/types";
import { lastIndex, nextIndex, positionFromScroll, prevIndex, visibleCount, AUTOPLAY_MS } from "@/lib/eshop/carousel";

vi.mock("next/image", () => ({ default: () => null }));

const CATEGORIES = ["polevky", "caje", "sirupy", "ovocne-napoje", "koktejly"].map((slug) => ({
  slug,
  name: slug,
  image: `/eshop/kategorie-${slug}.jpg`,
}));
const TILES: CarouselTile[] = CATEGORIES.map((c) => ({
  key: c.slug,
  href: `/eshop/kategorie/${c.slug}`,
  name: c.name,
  image: c.image,
  kind: "category",
}));

let scrollTo: ReturnType<typeof vi.fn>;
let reduced = false;

// jsdom nepočítá rozložení — rozměry jako na desktopu (3 dlaždice po 245 px, mezera 16 px).
for (const [prop, value] of [["offsetWidth", 245], ["clientWidth", 768], ["scrollWidth", 1269]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
}

beforeEach(() => {
  vi.useFakeTimers();
  scrollTo = vi.fn();
  Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
  reduced = false;
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("kolotoč — logika", () => {
  it("kolik je vidět, poslední pozice a posun dokola", () => {
    expect(visibleCount(768, 245, 16)).toBe(3);
    expect(visibleCount(343, 212, 16)).toBe(1);
    expect(lastIndex(5, 3)).toBe(2);
    expect(lastIndex(2, 3)).toBe(0);
    expect([nextIndex(0, 2), nextIndex(1, 2), nextIndex(2, 2)]).toEqual([1, 2, 0]);
    expect([prevIndex(0, 2), prevIndex(2, 2)]).toEqual([2, 1]);
  });

  it("konec řady pozná i když posun není celý násobek kroku (mobil) → další krok je zpět na začátek", () => {
    // mobil 375 px: krok 229, maximální posun 784 (5 dlaždic po 62 %)
    expect(positionFromScroll(784, 784, 229)).toEqual({ index: 4, last: 4 });
    expect(positionFromScroll(686, 784, 229)).toEqual({ index: 3, last: 4 });
    expect(nextIndex(positionFromScroll(784, 784, 229).index, 4)).toBe(0);
    // desktop: 3 vedle sebe, krok 251, maximální posun 501
    expect(positionFromScroll(501, 501, 251)).toEqual({ index: 2, last: 2 });
    expect(positionFromScroll(0, 0, 251)).toEqual({ index: 0, last: 0 });
  });
});

describe("kolotoč — chování", () => {
  it("všechny kategorie jako odkazy do kategorií, popsané pro čtečky", () => {
    render(<EshopCarousel label="Naše produkty" tiles={TILES} />);
    expect(screen.getByRole("region", { name: "Naše produkty" }).getAttribute("aria-roledescription")).toBe("carousel");
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(
      CATEGORIES.map((c) => `/eshop/kategorie/${c.slug}`)
    );
  });

  it("sám se posouvá; najetí myší ho zastaví, odjetí znovu spustí", () => {
    render(<EshopCarousel label="Naše produkty" tiles={TILES} />);
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const region = screen.getByRole("region", { name: "Naše produkty" });
    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS * 3));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(region);
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it("tlačítko pauzy zastaví automatický posun; šipky fungují dál", () => {
    render(<EshopCarousel label="Naše produkty" tiles={TILES} />);
    fireEvent.click(screen.getByRole("button", { name: "Pozastavit automatické posouvání" }));
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS * 3));
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Další" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Spustit automatické posouvání" })).toBeTruthy();
  });

  it("omezené animace v systému: žádný automatický posun ani tlačítko pauzy", () => {
    reduced = true;
    render(<EshopCarousel label="Naše produkty" tiles={TILES} />);
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS * 3));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /automatické posouvání/ })).toBeNull();
  });
});

function catalogWith(productNames: string[]): Catalog {
  return {
    categories: CATEGORIES.map((c) => ({ ...c, intro: [], detailSections: [], ageRestricted: false }) as unknown as Catalog["categories"][number]),
    products: productNames.map(
      (name, i) => ({ slug: `p-${i}`, name, category: "caje", image: `/eshop/p-${i}.jpg` }) as unknown as Product
    ),
  };
}

describe("co ukazuje kolotoč na stránkách", () => {
  it("výchozí: všechny kategorie s fotkou; na stránce kategorie bez ní samotné", () => {
    expect(categoryCarousel(catalogWith([])).tiles.map((t) => t.href)).toEqual(TILES.map((t) => t.href));
    expect(categoryCarousel(catalogWith([]), "caje").tiles.map((t) => t.key)).toEqual(["polevky", "sirupy", "ovocne-napoje", "koktejly"]);
  });

  it("O vodě: vybrané nápoje v pořadí od vedení, nalezené podle názvu (velikost písmen, diakritika)", () => {
    expect(WATER_DRINKS).toEqual(["Červánkové nebe", "Dům u jezera", "Heřmánkový ledový čaj", "Golden Nepál Ice Tea"]);
    const catalog = catalogWith(["Golden Nepal ice tea", "Kulajda", "ČERVÁNKOVÉ NEBE", "Heřmánkový ledový čaj", "Dům u jezera"]);
    const { label, tiles } = waterCarousel(catalog);
    expect(label).toBe("Nápoje");
    expect(tiles.map((t) => [t.name, t.href, t.kind])).toEqual([
      ["ČERVÁNKOVÉ NEBE", "/eshop/produkt/p-2", "product"],
      ["Dům u jezera", "/eshop/produkt/p-4", "product"],
      ["Heřmánkový ledový čaj", "/eshop/produkt/p-3", "product"],
      ["Golden Nepal ice tea", "/eshop/produkt/p-0", "product"],
    ]);
  });

  it("O vodě: nápoj, který v katalogu není, se vynechá; bez žádného zatím kategorie s nápoji", () => {
    expect(waterCarousel(catalogWith(["Dům u jezera"])).tiles.map((t) => t.name)).toEqual(["Dům u jezera"]);
    expect(waterCarousel(catalogWith(["Kulajda"])).tiles.map((t) => t.key)).toEqual(["caje", "sirupy", "ovocne-napoje"]);
  });

  it("dlaždice produktu vede na produkt", () => {
    const { tiles } = waterCarousel(catalogWith(["Dům u jezera", "Heřmánkový ledový čaj"]));
    render(<EshopCarousel label="Nápoje" tiles={tiles} />);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Dům u jezera", "/eshop/produkt/p-0"],
      ["Heřmánkový ledový čaj", "/eshop/produkt/p-1"],
    ]);
  });

  it("kolotoč je na informačních stránkách a u produktu; ne na úvodu, v kategorii, košíku, pokladně a objednávce", () => {
    const APP = path.join(__dirname, "../../app/eshop");
    const source = (route: string) => readFileSync(path.join(APP, route, "page.tsx"), "utf8");
    for (const route of ["o-nas", "o-vode", "doprava", "obchodni-podminky", "ochrana-osobnich-udaju", "produkt/[slug]"]) {
      expect(source(route), route).toContain("<PageCarousel");
    }
    expect(source("o-vode")).toContain('<PageCarousel content="water" />');
    for (const route of ["kategorie/[slug]", "kosik", "pokladna", "objednavka/[id]"]) {
      expect(existsSync(path.join(APP, route, "page.tsx")), route).toBe(true);
      expect(source(route), route).not.toContain("PageCarousel");
    }
  });
});
