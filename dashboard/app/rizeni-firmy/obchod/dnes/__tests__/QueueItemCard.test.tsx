// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import QueueItemCard from "../QueueItemCard";
import type { QueueItemCardData } from "@/lib/data/dailyCalls";

// LeadEmailField (vykreslovaná tady jako součást karty) importuje server
// akci z ../../actions (app/rizeni-firmy/obchod/actions.ts — leady jsou
// CRM doména, ne Denní volání, viz komentář u updateLeadContactEmailAction)
// — stejný důvod/stejné řešení jako u CallOutcomeForm výš v téhle složce
// (CallOutcomeForm.test.tsx): mimo Next.js runtime by hodnotový import
// "use server" modulu stáhl celý server-only řetězec (lib/data/leads.ts →
// DB klient). Cesta je z pohledu TOHOHLE testu (__tests__/) jinak
// relativní než z LeadEmailField.tsx samotné (dnes/) — proto "../../", ne
// "../".
vi.mock("../../actions", () => ({
  updateLeadContactEmailAction: async () => null,
}));

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
    contactEmail: "info@ukotvy.cz",
    stage: "new",
    lastNote: null,
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

  it("bez telefonu se odkaz nezobrazí", () => {
    const { container } = render(<QueueItemCard item={baseItem({ contactPhone: null })} orderNumber={1} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("poslední poznámka se zobrazí, pokud existuje", () => {
    render(<QueueItemCard item={baseItem({ lastNote: "Slíbil zavolat zpět." })} orderNumber={1} />);
    expect(screen.getByText(/Slíbil zavolat zpět\./)).toBeTruthy();
  });

  it("bez poznámky se řádek nezobrazí", () => {
    render(<QueueItemCard item={baseItem({ lastNote: null })} orderNumber={1} />);
    expect(screen.queryByText(/Poslední poznámka/)).toBeNull();
  });
});

// Jarda – volání a provize, část 1, bod 1 — e-mail přímo u kontaktu, bez
// nutnosti otevírat kartu. Povinné testy 1+2 ze zadání.
describe("QueueItemCard — e-mail u kontaktu (Jarda – volání a provize, část 1)", () => {
  it("existující e-mail se zobrazí pod telefonem, bez rozkliknutí detailu", () => {
    render(<QueueItemCard item={baseItem({ contactEmail: "jana@ukotvy.cz" })} orderNumber={1} />);
    expect(screen.getByText("jana@ukotvy.cz")).toBeTruthy();
    expect(screen.queryByText("Chybí e-mail")).toBeNull();
  });

  it("chybějící e-mail ukáže červené upozornění a tlačítko 'Přidat e-mail'", () => {
    render(<QueueItemCard item={baseItem({ contactEmail: null })} orderNumber={1} />);
    const warning = screen.getByText("Chybí e-mail");
    expect(warning.className).toContain("text-red-600");
    expect(screen.getByText("Přidat e-mail")).toBeTruthy();
  });

  it("kliknutí na 'Přidat e-mail' otevře prázdné pole (žádný předvyplněný zavináč) a Uložit/Zrušit", () => {
    render(<QueueItemCard item={baseItem({ contactEmail: null })} orderNumber={1} />);
    fireEvent.click(screen.getByText("Přidat e-mail"));

    const input = screen.getByPlaceholderText("jmeno@domena.cz") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByText("Uložit")).toBeTruthy();
    expect(screen.getByText("Zrušit")).toBeTruthy();
  });

  it("'Zrušit' zavře formulář zpátky na červené upozornění", () => {
    render(<QueueItemCard item={baseItem({ contactEmail: null })} orderNumber={1} />);
    fireEvent.click(screen.getByText("Přidat e-mail"));
    fireEvent.click(screen.getByText("Zrušit"));

    expect(screen.queryByPlaceholderText("jmeno@domena.cz")).toBeNull();
    expect(screen.getByText("Chybí e-mail")).toBeTruthy();
  });
});
