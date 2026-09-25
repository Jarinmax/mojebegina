// @vitest-environment jsdom
//
// Security Phase 16.3 — regresní test proti reálně nahlášenému bugu:
// select "Kdo leada původně získal" se u acquiredByUserId=NULL vizuálně
// (a reálně, ve skutečné hodnotě formuláře) tvářil jako by byl předvybraný
// první obchodník ze seznamu, protože placeholder <option> byl `disabled`
// — prohlížeč disabled option při určování aktuální hodnoty přeskočí a
// spadne na první NEdisabled option. Nikdy nesmí jít odeslat cizí osobu,
// aniž by ji uživatel vědomě vybral.
//
// "../../../actions" je "use server" modul, který přes lib/data/leads.ts
// (server-only, DB klient) není v jsdom testu importovatelný — mockováno,
// testuje se čistě vykreslený DOM select, ne skutečné volání akce.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import LeadOwnerForm from "../LeadOwnerForm";
import type { StaffOption } from "@/lib/data/leads";

vi.mock("../../../actions", () => ({
  assignLeadOwnerAction: async () => null,
  setLeadAcquiredByAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

const staff: StaffOption[] = [
  { userId: "u1", name: "Jaroslav Viner", email: "viner@begina.cz" },
  { userId: "u2", name: "Jaroslav Blahout", email: "blahout@begina.cz" },
];

function getSelect(container: HTMLElement, name: string): HTMLSelectElement {
  const select = container.querySelector(`select[name="${name}"]`);
  if (!select) throw new Error(`select[name="${name}"] nenalezen.`);
  return select as HTMLSelectElement;
}

describe("LeadOwnerForm — Security Phase 16.3", () => {
  it("acquiredByUserId = NULL → select nemá skutečně vybraného žádného konkrétního obchodníka", () => {
    const { container } = render(
      <LeadOwnerForm
        leadId="lead-1"
        ownerUserId="u2"
        ownerName="Jaroslav Blahout"
        acquiredByUserId={null}
        acquiredByName={null}
        staff={staff}
      />
    );

    const select = getSelect(container, "acquiredByUserId");
    // Skutečná hodnota formuláře — tohle by se odeslalo při submitu beze
    // změny. Nesmí to být ID žádného konkrétního člověka.
    expect(select.value).toBe("");
    for (const person of staff) {
      const option = Array.from(select.options).find((o) => o.value === person.userId);
      expect(option?.selected).toBe(false);
    }
  });

  it("acquiredByUserId nastavený → select ukazuje přesně tuhle osobu, ne prvního ze seznamu", () => {
    const { container } = render(
      <LeadOwnerForm
        leadId="lead-1"
        ownerUserId="u2"
        ownerName="Jaroslav Blahout"
        acquiredByUserId="u2"
        acquiredByName="Jaroslav Blahout"
        staff={staff}
      />
    );

    const select = getSelect(container, "acquiredByUserId");
    expect(select.value).toBe("u2");
  });

  it("ownerUserId = NULL → stejná zásada platí i pro obchodníka (stejná třída chyby)", () => {
    const { container } = render(
      <LeadOwnerForm
        leadId="lead-1"
        ownerUserId={null}
        ownerName={null}
        acquiredByUserId={null}
        acquiredByName={null}
        staff={staff}
      />
    );

    const select = getSelect(container, "ownerUserId");
    expect(select.value).toBe("");
  });
});
