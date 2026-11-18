// @vitest-environment jsdom
//
// Security Phase 17 — regrese na stejnou třídu bugu jako LeadOwnerForm
// (Security Phase 16.3): disabled placeholder option by prohlížeč tiše
// přeskočil při určování reálně vybrané hodnoty a spadl na prvního
// NEdisabled kandidáta ze seznamu, i když v DB je ownerUserId NULL.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import FocusOwnerForm from "../FocusOwnerForm";
import type { StaffOption } from "@/lib/data/ceoFocus";

vi.mock("../../actions", () => ({
  assignFocusOwnerAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

const staff: StaffOption[] = [
  { userId: "u1", name: "Jaroslav Viner", email: "viner@begina.cz" },
  { userId: "u2", name: "Jiří Střelec", email: "strelec@begina.cz" },
];

describe("FocusOwnerForm — Security Phase 17", () => {
  it("ownerUserId = NULL → select nemá skutečně vybraného žádného konkrétního člověka", () => {
    const { container } = render(
      <FocusOwnerForm projectId="proj-1" ownerUserId={null} ownerName={null} staff={staff} />
    );
    const select = container.querySelector('select[name="ownerUserId"]') as HTMLSelectElement;
    expect(select.value).toBe("");
    for (const person of staff) {
      const option = Array.from(select.options).find((o) => o.value === person.userId);
      expect(option?.selected).toBe(false);
    }
  });

  it("ownerUserId nastavený → select ukazuje přesně tuhle osobu", () => {
    const { container } = render(
      <FocusOwnerForm projectId="proj-1" ownerUserId="u2" ownerName="Jiří Střelec" staff={staff} />
    );
    const select = container.querySelector('select[name="ownerUserId"]') as HTMLSelectElement;
    expect(select.value).toBe("u2");
  });
});
