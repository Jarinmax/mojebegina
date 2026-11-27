import { describe, expect, it } from "vitest";
import { backTarget, breadcrumbs } from "../pageLabels";

describe("drobečková navigace a Zpět s názvem (27. 11. 2026)", () => {
  it("recept: Řízení firmy › Recepty › Recept, Zpět na Recepty", () => {
    expect(breadcrumbs("/rizeni-firmy/recepty/saman-sirup").map((c) => c.label)).toEqual(["Řízení firmy", "Recepty", "Recept"]);
    expect(backTarget("/rizeni-firmy/recepty/saman-sirup", "/admin")).toEqual({ href: "/rizeni-firmy/recepty", label: "Recepty" });
  });
  it("mezistupně bez stránky vynechá, z kořene na hlavní stránku", () => {
    expect(breadcrumbs("/rizeni-firmy/obchod/leady/abc").map((c) => c.label)).toEqual(["Řízení firmy", "Obchod / CRM", "Lead"]);
    expect(backTarget("/rizeni-firmy", "/admin")).toEqual({ href: "/admin", label: "hlavní stránku" });
  });
  it("etikety: krok zpět v rámci stránky", () => {
    expect(backTarget("/rizeni-firmy/etikety", "/admin", "jazyk=cs&kat=polevky").label).toBe("Etikety – předchozí krok");
  });
});
