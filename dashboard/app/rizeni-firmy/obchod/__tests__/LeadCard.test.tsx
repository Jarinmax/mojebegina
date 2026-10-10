// @vitest-environment jsdom
//
// Security Phase 16.6 — ověřuje, že karta v seznamu skutečně posílá
// returnTo do odkazu na detail leadu (druhá polovina opravy — samotná
// sanitizeReturnTo je otestovaná zvlášť v returnTo.test.ts).
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import LeadCard from "../LeadCard";
import type { LeadCardData } from "@/lib/data/leads";

afterEach(() => {
  cleanup();
});

function baseLead(overrides: Partial<LeadCardData> = {}): LeadCardData {
  return {
    id: "lead-1",
    companyName: "Kavárna U Nádraží",
    displayName: "Kavárna U Nádraží",
    contactName: "Jana Nová",
    contactPhone: "+420111222333",
    contactEmail: "jana@example.com",
    city: "Praha",
    venueType: "kavarna",
    source: "existing_database",
    stage: "contacted",
    ownerUserId: "u1",
    ownerName: "Jaroslav Blahout",
    lastContactedAt: null,
    nextFollowUpAt: null,
    nextStepNote: null,
    followUpOverdue: false,
    ...overrides,
  };
}

describe("LeadCard — Security Phase 16.6", () => {
  it("odkaz na detail obsahuje URL-encoded returnTo z aktuálního seznamu", () => {
    const { container } = render(
      <LeadCard lead={baseLead()} returnTo="/rizeni-firmy/obchod?view=vsechny-leady" />
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "/rizeni-firmy/obchod/leady/lead-1?returnTo=%2Frizeni-firmy%2Fobchod%3Fview%3Dvsechny-leady"
    );
  });

  it("jiný pohled (moje-leady) se propíše do returnTo jinak", () => {
    const { container } = render(
      <LeadCard lead={baseLead({ id: "lead-2" })} returnTo="/rizeni-firmy/obchod?view=moje-leady" />
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toContain("returnTo=%2Frizeni-firmy%2Fobchod%3Fview%3Dmoje-leady");
    expect(link?.getAttribute("href")).toContain("/rizeni-firmy/obchod/leady/lead-2");
  });
});
