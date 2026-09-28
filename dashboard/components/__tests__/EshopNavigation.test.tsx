// @vitest-environment jsdom
//
// Tlačítka do e-shopu v MojeBegina: horní lišty všech rolí, Řízení firmy,
// zákaznická karta. Testuje vykreslený DOM (skutečné <a> s href), cíl
// z lib/eshopLink.ts.
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

const eshopLinks = () => screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/eshop");

describe("tlačítko E-shop v horních lištách", () => {
  it.each([
    ["Admin", <AdminHeader key="a" name="Jaroslav Viner" email="j@example.cz" />],
    ["Executive", <ExecutiveHeader key="e" name="Jiří Střelec" email="s@example.cz" />],
    ["Řízení firmy", <CompanyOverviewHeader key="c" name="Jaroslav Viner" email="j@example.cz" backHref="/admin" />],
    ["zákazník", <Header key="z" initials="VD" />],
  ])("%s: viditelné „E-shop“ vedoucí na /eshop", (_role, header) => {
    render(header);
    const links = eshopLinks();
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("E-shop");
    expect(links[0].getAttribute("target")).toBeNull();
  });
});

describe("výrazná tlačítka", () => {
  it("Řízení firmy: „E-shop Begina.cz“ hned u nadpisu", () => {
    render(<CompanyOverviewIntro lastUpdated={new Date(Date.UTC(2026, 8, 21))} />);
    expect(screen.getByRole("heading", { name: "Řízení firmy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "E-shop Begina.cz" }).getAttribute("href")).toBe("/eshop");
  });

  it("zákaznická karta: „Nakoupit / E-shop“ jen když je zapnuté", () => {
    const props = { name: "The Cup s.r.o.", memberId: "BEG-1", status: "Zákazník Begina" };
    render(<MembershipCard {...props} showShopLink />);
    expect(screen.getByRole("link", { name: "Nakoupit / E-shop" }).getAttribute("href")).toBe("/eshop");
    cleanup();
    render(<MembershipCard {...props} />);
    expect(screen.queryByRole("link", { name: "Nakoupit / E-shop" })).toBeNull();
  });

  it("externí cíl (begina.cz) se otevře v nové záložce bez přístupu k MojeBegina (noopener)", () => {
    render(<EshopLink label="E-shop" variant="header" target={{ href: "https://begina.cz", external: true }} />);
    const link = screen.getByRole("link", { name: "E-shop" });
    expect(link.getAttribute("href")).toBe("https://begina.cz");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
