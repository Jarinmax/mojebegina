// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TodayCalls from "../TodayCalls";

const call = {
  leadId: "00000000-0000-4000-8000-0000000000a1",
  displayName: "Kavárna U Mostu",
  contactPhone: "+420 777 123 456",
  createdAt: new Date("2026-11-06T09:15:00Z"),
  resultLabel: "Zavolat později",
  note: "Ozvat se za 10 minut",
  authorName: "Jaroslav Blahout",
};

describe("Dnes zavoláno", () => {
  it("kontakt jde otevřít (zpět na Moje práce) a znovu mu zavolat", () => {
    render(<TodayCalls calls={[call]} showAuthor={false} back="prace" />);
    expect(screen.getByText("Dnes zavoláno (1)")).toBeTruthy();
    expect(screen.getByText(/10:15 · Zavolat později/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Otevřít kontakt/ }).getAttribute("href")).toBe(
      "/rizeni-firmy/obchod/leady/00000000-0000-4000-8000-0000000000a1?zpet=prace"
    );
    expect(screen.getByRole("link", { name: "Zavolat znovu Kavárna U Mostu" }).getAttribute("href")).toBe("tel:+420777123456");
    expect(screen.queryByText(/Jaroslav Blahout/)).toBeNull();
  });

  it("kurátor vidí autora; bez hovorů se sekce nezobrazí", () => {
    const { container, rerender } = render(<TodayCalls calls={[call]} showAuthor back="dnes" />);
    expect(screen.getByText(/Jaroslav Blahout/)).toBeTruthy();
    rerender(<TodayCalls calls={[]} showAuthor back="dnes" />);
    expect(container.textContent).toBe("");
  });
});
