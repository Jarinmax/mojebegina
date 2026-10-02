// @vitest-environment jsdom
//
// Security Phase 19.4 — jasné označení, pro koho je zveřejněná fronta
// určena, musí být viditelné v obou pohledech (kurátor i pracovník) a
// musí zobrazovat aktuální počet kontaktů.
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import QueueRecipientNotice from "../QueueRecipientNotice";

afterEach(() => {
  cleanup();
});

describe("QueueRecipientNotice — Security Phase 19.4", () => {
  it("zobrazuje jméno příjemce fronty a zadaný počet kontaktů", () => {
    const { container } = render(<QueueRecipientNotice count={9} />);
    expect(screen.getByText("Jaroslav Blahout")).toBeDefined();
    expect(container.textContent).toContain("Volací fronta pro:");
    expect(container.textContent).toContain("aktuálně");
    expect(container.textContent).toContain("9 kontaktů");
  });

  it("zobrazuje 0 kontaktů, když je fronta prázdná", () => {
    const { container } = render(<QueueRecipientNotice count={0} />);
    expect(container.textContent).toContain("aktuálně");
    expect(container.textContent).toContain("0 kontaktů");
  });

  it("aktualizuje zobrazený počet při změně počtu kontaktů", () => {
    const { container, rerender } = render(<QueueRecipientNotice count={3} />);
    expect(container.textContent).toContain("3 kontaktů");

    rerender(<QueueRecipientNotice count={7} />);
    expect(container.textContent).toContain("7 kontaktů");
    expect(container.textContent).not.toContain("3 kontaktů");
  });
});
