// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import QueueItemCard from "../QueueItemCard";
import type { QueueItemCardData } from "@/lib/data/dailyCalls";

afterEach(() => {
  cleanup();
});

function baseItem(overrides: Partial<QueueItemCardData> = {}): QueueItemCardData {
  return {
    id: "item-1",
    position: 0,
    source: "auto",
    isDraft: false,
    addedForDate: "2026-06-01",
    leadId: "lead-1",
    displayName: "U Kotvy s.r.o.",
    contactPhone: "+420 777 123 456",
    stage: "new",
    lastNote: null,
    lastContactedAt: null,
    notInterested: false,
    ...overrides,
  };
}

// Security Phase 19 — minimum ze zadání: jméno, klikací telefon, stav,
// poslední poznámka, pořadí musí být na kartě vidět.
describe("QueueItemCard — Security Phase 19", () => {
  it("zobrazí jméno a pořadí", () => {
    render(<QueueItemCard item={baseItem()} orderNumber={3} />);
    expect(screen.getByText("U Kotvy s.r.o.")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();
  });

  it("telefon je klikací tel: odkaz bez mezer", () => {
    const { container } = render(<QueueItemCard item={baseItem()} orderNumber={1} />);
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("tel:+420777123456");
  });

  it("bez telefonu se odkaz pro volání nezobrazí", () => {
    const { container } = render(<QueueItemCard item={baseItem({ contactPhone: null })} orderNumber={1} />);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it("kontakt jde kdykoli otevřít i s historií (zpět na Dnešní volání)", () => {
    const { container } = render(<QueueItemCard item={baseItem({ contactPhone: null })} orderNumber={1} />);
    const link = screen.getByRole("link", { name: /Otevřít kontakt a historii/ });
    expect(link.getAttribute("href")).toBe(`/rizeni-firmy/obchod/leady/${baseItem({}).leadId}?zpet=dnes`);
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("poslední poznámka se zobrazí, pokud existuje", () => {
    render(<QueueItemCard item={baseItem({ lastNote: "Slíbil zavolat zpět." })} orderNumber={1} />);
    expect(screen.getByText(/Slíbil zavolat zpět\./)).toBeTruthy();
  });

  it("nezájem je pro kurátora výrazně označený, jinak nic", () => {
    render(<QueueItemCard item={baseItem({ notInterested: true })} orderNumber={1} />);
    expect(screen.getByText(/Nezájem — Jardovi se nezobrazuje/)).toBeTruthy();
  });

  it("bez nezájmu se označení nezobrazí", () => {
    render(<QueueItemCard item={baseItem()} orderNumber={1} />);
    expect(screen.queryByText(/Nezájem/)).toBeNull();
  });

  it("bez poznámky se řádek nezobrazí", () => {
    render(<QueueItemCard item={baseItem({ lastNote: null })} orderNumber={1} />);
    expect(screen.queryByText(/Poslední poznámka/)).toBeNull();
  });

  it("naposledy voláno se zobrazí, pokud byl kontakt dřív obvolaný", () => {
    render(<QueueItemCard item={baseItem({ lastContactedAt: new Date(Date.UTC(2026, 10, 3)) })} orderNumber={1} />);
    expect(screen.getByText("Naposledy voláno: 3. 11. 2026")).toBeTruthy();
  });

  it("bez předchozího hovoru se upozornění nezobrazí", () => {
    render(<QueueItemCard item={baseItem({ lastContactedAt: null })} orderNumber={1} />);
    expect(screen.queryByText(/Naposledy voláno/)).toBeNull();
  });
});
