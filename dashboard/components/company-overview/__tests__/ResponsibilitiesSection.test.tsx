// @vitest-environment jsdom
// Rozdělení odpovědností: vedení v první řadě beze změny, tým v oddělené
// druhé řadě ve stejném stylu karet; v DOM (a tedy na mobilu) nejdřív vedení.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ResponsibilitiesSection from "../ResponsibilitiesSection";
import { companyOverview } from "@/lib/content/companyOverview";

afterEach(cleanup);

describe("ResponsibilitiesSection", () => {
  it("vedení nahoře, tým v oddělené sekci pod ním; pořadí karet 1–5", () => {
    const { container } = render(
      <ResponsibilitiesSection leadership={companyOverview.responsibilities} team={companyOverview.teamResponsibilities} />
    );
    const names = [...container.querySelectorAll("p.font-medium")].map((p) => p.textContent);
    expect(names).toEqual(["Jaroslav Viner", "Lucie Königsbergová", "Jiří Střelec", "Jaroslav Blahout", "Josef Göndör"]);

    const team = screen.getByRole("region", { name: "Tým" });
    expect(team.className).toContain("border-t");
    expect(within(team).queryByText("Jaroslav Viner")).toBeNull();
    expect(within(team).getByText("Obchod, bistro, programování, vývoj")).toBeTruthy();
    expect(within(team).getByText("Marketing, strategie")).toBeTruthy();
  });

  it("stejný styl karet; tým bez prázdného seznamu, vedení se seznamem oblastí", () => {
    const { container } = render(
      <ResponsibilitiesSection leadership={companyOverview.responsibilities} team={companyOverview.teamResponsibilities} />
    );
    const cards = [...container.querySelectorAll("div.rounded-xl")];
    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((c) => c.className)).size).toBe(1);
    expect(cards.slice(0, 3).every((c) => c.querySelector("ul"))).toBe(true);
    expect(cards.slice(3).every((c) => !c.querySelector("ul"))).toBe(true);
    // obě řady: na mobilu jedna karta pod druhou, od sm dvě a od lg tři vedle sebe
    const grids = [...container.querySelectorAll("div.grid")];
    expect(grids).toHaveLength(2);
    expect(grids.every((g) => g.className === grids[0].className && /grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/.test(g.className))).toBe(
      true
    );
  });

  it("bez týmu se druhá řada nevykreslí", () => {
    render(<ResponsibilitiesSection leadership={companyOverview.responsibilities} team={[]} />);
    expect(screen.queryByRole("region", { name: "Tým" })).toBeNull();
  });
});
