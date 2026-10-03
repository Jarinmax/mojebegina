// @vitest-environment jsdom
// ESHOP 1.0 — patička: odkazy O nás, Doprava, Obchodní podmínky, GDPR jsou
// skutečné odkazy na existující stránky (dřív jen text bez odkazu).
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EshopFooter from "../eshop/EshopFooter";
import InfoPageView from "../eshop/InfoPageView";
import { FOOTER_LINKS, INFO_PAGES } from "@/lib/eshop/infoPages";

afterEach(() => cleanup());

const APP = path.join(__dirname, "../../app");

describe("patička e-shopu", () => {
  it("čtyři klikací odkazy ve správném pořadí a na správné adresy", () => {
    render(<EshopFooter />);
    const nav = screen.getByRole("navigation", { name: "Informace" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["O nás", "/eshop/o-nas"],
      ["Doprava", "/eshop/doprava"],
      ["Obchodní podmínky", "/eshop/obchodni-podminky"],
      ["GDPR", "/eshop/ochrana-osobnich-udaju"],
    ]);
  });

  it("každý odkaz má svou stránku (app/…/page.tsx)", () => {
    for (const page of FOOTER_LINKS) {
      expect(existsSync(path.join(APP, page.path, "page.tsx")), page.path).toBe(true);
    }
  });

  it("kontakt provozovatele zůstává (telefon, e-mail)", () => {
    render(<EshopFooter />);
    expect(screen.getByRole("link", { name: "+420 774 199 975" }).getAttribute("href")).toBe("tel:+420774199975");
    expect(screen.getByRole("link", { name: "info@begina.cz" }).getAttribute("href")).toBe("mailto:info@begina.cz");
  });
});

describe("informační stránky", () => {
  it("Doprava: způsoby doručení a platby z dat pokladny (ceny, splatnost)", () => {
    render(<InfoPageView page={INFO_PAGES.shipping} />);
    expect(screen.getByRole("heading", { level: 1, name: "Doprava a platba" })).toBeTruthy();
    expect(screen.getByText(/Osobní vyzvednutí — Zahradní Bistro Begina — zdarma\. Areál Zahradnictví Jandl/)).toBeTruthy();
    expect(screen.getByText(/Chlazená přeprava — 99\s+Kč\./)).toBeTruthy();
    expect(screen.getByText(/Splatnost je 5 dní/)).toBeTruthy();
  });

  it("O nás: text z begina.cz/o-nas (dodaný 4. 10. 2026), celý a v pořadí", () => {
    render(<InfoPageView page={INFO_PAGES.about} />);
    expect(screen.getByRole("heading", { level: 1, name: "O nás" })).toBeTruthy();
    const text = document.querySelector("article")!.textContent!;
    const order = [
      "Chuť je pro mě základ.",
      "v roce 2018",
      "Bag-in-Box systém",
      "V roce 2023 jsem potkal Lucii",
      "Simon Gallery",
      "postavili značku Begina.",
      "že když něco chutná dobře, poznáš to hned.",
      "v praktickém balení pro každodenní použití.",
      "Bag-in-Box balení o objemu 3 litry.",
      "✔ profesionální příprava",
      "✔ bez lepku",
      "Jednoduchý způsob, jak mít čerstvou polévku nebo nápoj vždy po ruce.",
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(INFO_PAGES.about.pendingNote).toBeUndefined();
  });

  it("O vodě: text z begina.cz/o-vode (dodaný 3. 10. 2026), celý a v pořadí", () => {
    render(<InfoPageView page={INFO_PAGES.water} />);
    expect(screen.getByRole("heading", { level: 1, name: "Voda je základ" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Kvalita vody je pro nás důležitá" })).toBeTruthy();
    const text = document.querySelector("article")!.textContent!;
    const order = [
      "Voda je nezbytnou součástí života.",
      "přibližně 71 % povrchu Země",
      "hydrataci buněk, trávení a vstřebávání živin.",
      "součástí zdravého životního stylu.",
      "Kvalita vody je pro nás důležitá",
      "konzistentní kvality napříč celou výrobou.",
      "nechat vyniknout chuť použitých surovin.",
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(existsSync(path.join(APP, INFO_PAGES.water.path, "page.tsx"))).toBe(true);
  });

  it("GDPR bez dodaného textu: „Text připravujeme“ + kontakt, nic vymyšleného", () => {
    expect(INFO_PAGES.privacy.blocks).toBeNull();
    render(<InfoPageView page={INFO_PAGES.privacy} />);
    expect(screen.getByText("Text připravujeme.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "info@begina.cz" })).toHaveLength(1);
  });
});

describe("obchodní podmínky (text dodaný 3. 10. 2026)", () => {
  it("13 článků I–XIII s počty bodů přesně podle dodaného znění", () => {
    const blocks = INFO_PAGES.terms.blocks!;
    expect(blocks.map((b) => [b.heading!.split(".")[0], b.points!.length])).toEqual([
      ["I", 4], ["II", 5], ["III", 5], ["IV", 7], ["V", 7], ["VI", 11], ["VII", 8],
      ["VIII", 13], ["IX", 4], ["X", 7], ["XI", 2], ["XII", 2], ["XIII", 6],
    ]);
    const subItems = blocks.flatMap((b) => b.points!.map((p) => p.items?.length ?? 0)).filter(Boolean);
    expect(subItems).toEqual([6, 3, 5, 5, 7, 3, 5, 5]);
  });

  it("stránka: nadpis, účinnost, číslované body, odkazy na e-mail, telefon, ČOI", () => {
    render(<InfoPageView page={INFO_PAGES.terms} />);
    expect(screen.getByRole("heading", { level: 1, name: "Obchodní podmínky e-shopu Begina.cz" })).toBeTruthy();
    expect(screen.getByText("Platné a účinné od 22. září 2026")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(13);
    expect(screen.getByText(/Prodávající není plátcem daně z přidané hodnoty\./)).toBeTruthy();
    expect(screen.getByText(/Tyto obchodní podmínky jsou platné a účinné od 22\. září 2026\./)).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["mailto:info@begina.cz", "tel:+420774199975", "https://www.coi.cz", "https://adr.coi.cz", "https://www.begina.cz"]));
  });
});
