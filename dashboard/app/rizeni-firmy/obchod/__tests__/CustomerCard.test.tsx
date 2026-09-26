// @vitest-environment jsdom
//
// Security Phase 16.6 — viz LeadCard.test.tsx, stejná oprava pro kartu
// zákazníka (odkaz z "Všichni zákazníci"/"Moji zákazníci" musí nést
// returnTo, aby "Zpět" z detailu zákazníka věděl, kam se vrátit).
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import CustomerCard from "../CustomerCard";
import type { CustomerCardData } from "@/lib/data/leads";

afterEach(() => {
  cleanup();
});

function baseCustomer(overrides: Partial<CustomerCardData> = {}): CustomerCardData {
  return {
    id: "org-1",
    name: "Kavárna U Nádraží s.r.o.",
    ico: "12345678",
    ownerUserId: "u1",
    ownerName: "Jaroslav Blahout",
    acquiredByUserId: null,
    acquiredByName: null,
    orderCount: 3,
    totalRevenueKc: 15000,
    lastOrderAt: null,
    ...overrides,
  };
}

describe("CustomerCard — Security Phase 16.6", () => {
  it("odkaz na detail zákazníka obsahuje URL-encoded returnTo z aktuálního seznamu", () => {
    const { container } = render(
      <CustomerCard customer={baseCustomer()} returnTo="/rizeni-firmy/obchod?view=vsechny-leady" />
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "/rizeni-firmy/obchod/zakaznici/org-1?returnTo=%2Frizeni-firmy%2Fobchod%3Fview%3Dvsechny-leady"
    );
  });

  it("returnTo z pohledu Všichni zákazníci se propíše správně", () => {
    const { container } = render(
      <CustomerCard
        customer={baseCustomer({ id: "org-2" })}
        returnTo="/rizeni-firmy/obchod?view=vsichni-zakaznici"
      />
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toContain(
      "returnTo=%2Frizeni-firmy%2Fobchod%3Fview%3Dvsichni-zakaznici"
    );
  });
});
