// @vitest-environment jsdom
//
// Jarin 22. 11. 2026: firma u leadu se předvyplní z ARES podle IČO nebo názvu.
// Server akce jsou mockované (DB/ARES nejsou v jsdom dostupné).
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CompanyDetailsForm from "../CompanyDetailsForm";

const company = {
  ico: "10691731",
  name: "Starý Chřestýš s.r.o.",
  dic: "CZ10691731",
  address: "Mostecká 273/21, 118 00 Praha",
  city: "Praha",
};

vi.mock("../../../actions", () => ({ updateLeadCompanyDetailsAction: async () => ({ success: "ok" }) }));
vi.mock("../../../aresActions", () => ({
  aresLookupByIcoAction: vi.fn(async () => ({ ok: true, company })),
  aresSearchByNameAction: vi.fn(async () => ({ ok: true, companies: [company] })),
}));

afterEach(() => cleanup());

function field(container: HTMLElement, name: string) {
  return container.querySelector(`input[name="${name}"]`) as HTMLInputElement;
}

describe("CompanyDetailsForm – ARES", () => {
  it("po zadání IČO doplní název a sídlo", async () => {
    const { container } = render(<CompanyDetailsForm leadId="l1" companyName={null} ico={null} address={null} />);
    fireEvent.click(screen.getByText("Doplnit firmu"));
    fireEvent.change(field(container, "ico"), { target: { value: "10691731" } });
    await waitFor(() => expect(field(container, "companyName").value).toBe("Starý Chřestýš s.r.o."));
    expect(field(container, "address").value).toBe("Mostecká 273/21, 118 00 Praha");
    expect(screen.getByText(/Doplněno z ARES/)).toBeTruthy();
  });

  it("podle názvu nabídne firmu a po výběru doplní IČO i sídlo", async () => {
    const { container } = render(<CompanyDetailsForm leadId="l1" companyName={null} ico={null} address={null} />);
    fireEvent.click(screen.getByText("Doplnit firmu"));
    fireEvent.change(field(container, "companyName"), { target: { value: "Chřestýš" } });
    const option = await screen.findByText("Starý Chřestýš s.r.o.", {}, { timeout: 2000 });
    fireEvent.click(option);
    expect(field(container, "ico").value).toBe("10691731");
    expect(field(container, "address").value).toBe("Mostecká 273/21, 118 00 Praha");
  });

  it("v náhledu ukáže název, IČO a sídlo", () => {
    render(<CompanyDetailsForm leadId="l1" companyName="Starý Chřestýš s.r.o." ico="10691731" address="Mostecká 273/21, 118 00 Praha" />);
    expect(screen.getByText("IČO 10691731 · Mostecká 273/21, 118 00 Praha")).toBeTruthy();
    expect(screen.getByText("Upravit")).toBeTruthy();
  });
});
