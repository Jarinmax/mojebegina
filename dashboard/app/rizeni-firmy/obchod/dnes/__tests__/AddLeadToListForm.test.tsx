// @vitest-environment jsdom
//
// Security Phase 19 — regrese na bug nahlášený na Preview: formulář
// ručního přidání musí při plné frontě (isFull) zmizet/zablokovat se, ne
// jen tiše dovolit odeslání, které stejně skončí chybou z datové vrstvy.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AddLeadToListForm from "../AddLeadToListForm";
import type { LeadOption } from "@/lib/data/dailyCalls";

vi.mock("../actions", () => ({
  addManualCandidateAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

const options: LeadOption[] = [{ id: "lead-1", displayName: "U Kotvy s.r.o." }];

describe("AddLeadToListForm — Security Phase 19", () => {
  it("při plné frontě (isFull) se select ani tlačítko Přidat nezobrazí", () => {
    render(<AddLeadToListForm options={options} isFull={true} />);
    expect(screen.queryByLabelText(/Ručně přidat kontakt/)).toBeNull();
    expect(screen.queryByText("Přidat")).toBeNull();
    expect(screen.getByText(/maximálních 10 kontaktů/)).toBeTruthy();
  });

  it("při volné frontě se formulář zobrazí normálně", () => {
    render(<AddLeadToListForm options={options} isFull={false} />);
    expect(screen.getByLabelText(/Ručně přidat kontakt/)).toBeTruthy();
    expect(screen.getByText("Přidat")).toBeTruthy();
  });
});
