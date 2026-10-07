// @vitest-environment jsdom
//
// Tlačítko do e-shopu je JEN v Řízení firmy (rozhodnutí vedení 28. 9. 2026):
// horní lišty a zákaznická karta ho nemají — e-shop je zatím pro koncové
// zákazníky, partneři by v něm nakoupili za maloobchodní ceny mimo svůj účet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/admin/AdminSignOutButton", () => ({ default: () => <button>Odhlásit se</button> }));
vi.mock("next/image", () => ({ default: () => <span data-testid="logo" /> }));

import EshopLink from "../EshopLink";
import Header from "../Header";
import MembershipCard from "../MembershipCard";
import AdminHeader from "../admin/AdminHeader";
import ExecutiveHeader from "../executive/ExecutiveHeader";
import CompanyOverviewHeader from "../company-overview/CompanyOverviewHeader";
import CompanyOverviewIntro from "../../app/rizeni-firmy/CompanyOverviewIntro";

afterEach(() => cleanup());

const eshopLinks = () => screen.queryAllByRole("link").filter((a) => /eshop|begina\.cz/.test(a.getAttribute("href") ?? ""));

describe("tlačítko E-shop", () => {
  it("Řízení firmy: „E-shop Begina.cz“ hned u nadpisu, vede na /eshop", () => {
    render(<CompanyOverviewIntro lastUpdated={new Date(Date.UTC(2026, 8, 21))} />);
    expect(screen.getByRole("heading", { name: "Řízení firmy" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "E-shop Begina.cz" });
    expect(link.getAttribute("href")).toBe("/eshop");
    expect(link.getAttribute("target")).toBeNull();
  });

  it("Řízení firmy v Production se skrytým e-shopem: tlačítko není (vedlo by na 404)", () => {
    const saved = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      render(<CompanyOverviewIntro lastUpdated={new Date(Date.UTC(2026, 8, 21))} />);
      expect(screen.queryByRole("link", { name: "E-shop Begina.cz" })).toBeNull();
    } finally {
      process.env.VERCEL_ENV = saved;
    }
  });

  it.each([
    ["Admin", <AdminHeader key="a" name="Jaroslav Viner" email="j@example.cz" />],
    ["Executive", <ExecutiveHeader key="e" name="Jiří Střelec" email="s@example.cz" />],
    ["Řízení firmy (lišta)", <CompanyOverviewHeader key="c" name="Jaroslav Viner" email="j@example.cz" backHref="/admin" />],
    ["zákazník (lišta)", <Header key="z" initials="VD" />],
    [
      "zákaznická karta",
      <MembershipCard key="m" name="The Cup s.r.o." memberId="BEG-1" status="Zákazník Begina" />,
    ],
  ])("%s: bez odkazu do e-shopu", (_where, element) => {
    render(element);
    expect(eshopLinks()).toEqual([]);
  });

  it("externí cíl (begina.cz) se otevře v nové záložce s noopener", () => {
    render(<EshopLink label="E-shop Begina.cz" target={{ href: "https://begina.cz", external: true }} />);
    const link = screen.getByRole("link", { name: "E-shop Begina.cz" });
    expect(link.getAttribute("href")).toBe("https://begina.cz");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
