// @vitest-environment jsdom
//
// Security Phase 16.2 — regresní test proti přesně tomuhle typu chyby:
// dlaždice v mapě firmy vypadala jako tlačítko, ale nebyla to <a> a tap
// nikam nevedl. Testuje skutečně vykreslený DOM (ne jen JSX zdrojový kód),
// stejně jako jsme to ověřovali ručně přes Playwright při diagnostice
// tohohle bugu — jen bez závislosti na běžícím serveru/prohlížeči.
//
// Testuje se proti SKUTEČNÝM datům z lib/content/companyOverview.ts
// (ne proti lokální fixture), aby test spadl i v případě, že někdo omylem
// odstraní href u těchhle dvou položek přímo v datech, ne jen v komponentě.
//
// Dotazuje se přímo na dlaždice v gridu (ne přes text), protože některé
// popisky (např. "Sklad", "Výroba") se stejně jmenují i v jiné části
// stránky (Hlavní obchodně-provozní tok) — hledání podle textu by tam
// narazilo na víc shod.
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import CompanyMap from "../CompanyMap";
import { companyOverview } from "../../../lib/content/companyOverview";

afterEach(() => {
  cleanup();
});

function renderMap() {
  const { container } = render(
    <CompanyMap
      mapAreas={companyOverview.mapAreas}
      mainFlow={companyOverview.mainFlow}
      mapNotes={companyOverview.mapNotes}
    />
  );
  const grid = container.querySelector(".grid");
  if (!grid) throw new Error("Grid dlaždic nebyl nalezen.");
  return grid;
}

function findTile(grid: Element, label: string): Element {
  const tile = Array.from(grid.children).find((el) => el.textContent === label);
  if (!tile) throw new Error(`Dlaždice "${label}" nebyla v gridu nalezena.`);
  return tile;
}

describe("CompanyMap — Security Phase 16.2", () => {
  it("dlaždice Obchod / CRM je skutečný <a> odkaz na /rizeni-firmy/obchod", () => {
    const tile = findTile(renderMap(), "Obchod / CRM");
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("/rizeni-firmy/obchod");
  });

  it("dlaždice Objednávky je skutečný <a> odkaz na /rizeni-firmy/objednavky", () => {
    const tile = findTile(renderMap(), "Objednávky");
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("/rizeni-firmy/objednavky");
  });

  it("neaktivní dlaždice (bez href) NENÍ odkaz — žádné vymyšlené href na neexistující stránky", () => {
    const grid = renderMap();
    const inactiveAreas = companyOverview.mapAreas.filter((a) => !a.href);
    expect(inactiveAreas.length).toBeGreaterThan(0);
    for (const area of inactiveAreas) {
      const tile = findTile(grid, area.label);
      expect(tile.tagName).not.toBe("A");
      expect(tile.hasAttribute("href")).toBe(false);
    }
  });

  it("počet dlaždic v gridu odpovídá počtu položek v mapAreas", () => {
    const grid = renderMap();
    expect(grid.children.length).toBe(companyOverview.mapAreas.length);
  });
});
