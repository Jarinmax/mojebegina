// @vitest-environment jsdom
//
// Security Phase 19.3 — celá bílá karta CEO přehledu musí být jeden
// klikací odkaz na /rizeni-firmy/ceo, ne jen samostatný text "Otevřít →"
// vedle ní, a nesmí jít o vnořený odkaz uvnitř jiného odkazu.
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CeoFocusPanel from "../CeoFocusPanel";

afterEach(() => {
  cleanup();
});

describe("CeoFocusPanel — Security Phase 19.3", () => {
  it("je to přesně jeden odkaz (žádný vnořený odkaz uvnitř odkazu) a vede na /rizeni-firmy/ceo", () => {
    const { container } = render(<CeoFocusPanel />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/rizeni-firmy/ceo");
  });

  it("popisný text i 'Otevřít →' jsou součástí téhož odkazu (stejná klikací oblast)", () => {
    render(<CeoFocusPanel />);
    const link = screen.getByRole("link");
    expect(link.textContent).toContain("Hlavní projekty, priority");
    expect(link.textContent).toContain("Otevřít →");
  });

  it("je to skutečný <a> prvek, ne <div> s onClick — přirozeně dostupné klávesnicí (Tab + Enter)", () => {
    render(<CeoFocusPanel />);
    const link = screen.getByRole("link");
    expect(link.tagName).toBe("A");
    // Skutečný <a href> je v DOM pořadí fokusovatelný bez tabIndex navíc.
    expect(link.hasAttribute("tabindex")).toBe(false);
  });
});
