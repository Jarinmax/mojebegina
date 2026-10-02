// @vitest-environment jsdom
// Kolotoč kategorií na stránce O nás: posun dokola, šipky, tečky, pauza.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CategoryCarousel from "../eshop/CategoryCarousel";
import { lastIndex, nextIndex, positionFromScroll, prevIndex, visibleCount, AUTOPLAY_MS } from "@/lib/eshop/carousel";

vi.mock("next/image", () => ({ default: () => null }));

const CATEGORIES = ["polevky", "caje", "sirupy", "ovocne-napoje", "koktejly"].map((slug) => ({
  slug,
  name: slug,
  image: `/eshop/kategorie-${slug}.jpg`,
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
    render(<CategoryCarousel label="Naše produkty" categories={CATEGORIES} />);
    expect(screen.getByRole("region", { name: "Naše produkty" }).getAttribute("aria-roledescription")).toBe("carousel");
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(
      CATEGORIES.map((c) => `/eshop/kategorie/${c.slug}`)
    );
  });

  it("sám se posouvá; najetí myší ho zastaví, odjetí znovu spustí", () => {
    render(<CategoryCarousel label="Naše produkty" categories={CATEGORIES} />);
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
    render(<CategoryCarousel label="Naše produkty" categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole("button", { name: "Pozastavit automatické posouvání" }));
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS * 3));
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Další" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Spustit automatické posouvání" })).toBeTruthy();
  });

  it("omezené animace v systému: žádný automatický posun ani tlačítko pauzy", () => {
    reduced = true;
    render(<CategoryCarousel label="Naše produkty" categories={CATEGORIES} />);
    act(() => vi.advanceTimersByTime(AUTOPLAY_MS * 3));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /automatické posouvání/ })).toBeNull();
  });
});
