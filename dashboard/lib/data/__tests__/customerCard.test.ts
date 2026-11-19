import { describe, expect, it } from "vitest";
import { planCustomerCardChange } from "../customerCard";

describe("planCustomerCardChange — název karty vs. fakturační jméno", () => {
  it("přejmenování karty zachová dosavadní název jako fakturační jméno (faktury se nezmění)", () => {
    expect(planCustomerCardChange({ name: "Lenka Kermes", billingName: null }, { name: "Marek Baroš" })).toEqual({
      name: "Marek Baroš",
      billingName: "Lenka Kermes",
      changed: ["name", "billing_name"],
    });
  });

  it("výslovné fakturační jméno má přednost", () => {
    expect(planCustomerCardChange({ name: "Lenka Kermes", billingName: null }, { name: "Marek Baroš", billingName: "Lenka Kermes – RES" })).toMatchObject({
      name: "Marek Baroš",
      billingName: "Lenka Kermes – RES",
    });
  });

  it("prázdné fakturační jméno = faktura na název karty", () => {
    expect(planCustomerCardChange({ name: "Marek Baroš", billingName: "Lenka Kermes" }, { billingName: "" })).toEqual({
      name: "Marek Baroš",
      billingName: null,
      changed: ["billing_name"],
    });
  });

  it("fakturační jméno shodné s názvem se neukládá a beze změn nic nehlásí", () => {
    expect(planCustomerCardChange({ name: "Kavárna X", billingName: null }, { billingName: "  Kavárna   X " })).toEqual({ name: "Kavárna X", billingName: null, changed: [] });
    expect(planCustomerCardChange({ name: "Marek Baroš", billingName: "Lenka Kermes" }, { name: "Marek Baroš" }).changed).toEqual([]);
  });

  it("přejmenování karty s už vyplněným fakturačním jménem ho nechá", () => {
    expect(planCustomerCardChange({ name: "Marek", billingName: "Lenka Kermes" }, { name: "Marek Baroš" })).toEqual({
      name: "Marek Baroš",
      billingName: "Lenka Kermes",
      changed: ["name"],
    });
  });
});
