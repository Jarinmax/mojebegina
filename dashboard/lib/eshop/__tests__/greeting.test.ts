// Oslovení zákazníka v e-mailech: vždy „pane Průcho“ / „paní Průchová“;
// neutrálně jen u názvu firmy nebo jednoho slova.
import { describe, expect, it } from "vitest";
import { customerGreeting, maleSurnameVocative } from "../email/greeting";
import { customerOrderEmail, type EmailOrder } from "../email/templates";

describe("oslovení zákazníka", () => {
  it.each([
    ["Jiří Průcha", "Dobrý den, pane Průcho,"],
    ["Lenka Odrazilová", "Dobrý den, paní Odrazilová,"],
    ["Jana Průchová", "Dobrý den, paní Průchová,"],
    ["Jaroslav Viner", "Dobrý den, pane Vinere,"],
    ["Petr Novák", "Dobrý den, pane Nováku,"],
    ["Tomáš Hájek", "Dobrý den, pane Hájku,"],
    ["Pavel Novotný", "Dobrý den, pane Novotný,"],
    ["Martin Bartoš", "Dobrý den, pane Bartoši,"],
    ["Jan Svoboda", "Dobrý den, pane Svobodo,"],
    ["Ing. Karel Dvořák", "Dobrý den, pane Dvořáku,"],
    ["Eva Malá", "Dobrý den, paní Malá,"],
    ["Honza Kučera", "Dobrý den, pane Kučero,"],
    ["jiří průcha", "Dobrý den, pane Průcho,"],
    ["Jana Novák", "Dobrý den, paní Novák,"],
    ["Josef Němec", "Dobrý den, pane Němče,"],
    ["Václav Havel", "Dobrý den, pane Havle,"],
    ["Karel Moravec", "Dobrý den, pane Moravče,"],
    // ne jméno osoby → neutrálně
    ["Cukrárna Kavárna Adélka", "Dobrý den,"],
    ["Bistro U Lípy", "Dobrý den,"],
    ["Průcha", "Dobrý den,"],
    ["", "Dobrý den,"],
    [null, "Dobrý den,"],
  ])("%s → %s", (name, expected) => {
    expect(customerGreeting(name)).toBe(expected);
  });

  it("5. pád jen u jistých tvarů", () => {
    expect(maleSurnameVocative("Sedláček")).toBe("Sedláčku");
    expect(maleSurnameVocative("Kříž")).toBe("Kříži");
    expect(maleSurnameVocative("Krejčí")).toBe("Krejčí");
    expect(maleSurnameVocative("Moravec")).toBe("Moravče");
    expect(maleSurnameVocative("Hugo")).toBe("Hugo");
  });

  it("v e-mailu zákazníkovi", () => {
    const order = {
      id: "00000000-0000-4000-8000-0000000000aa", orderNumber: 70000010, paymentVs: "70000010",
      contactName: "Jiří Průcha", contactEmail: "j@example.cz", recipientAddress: null,
      shippingMethodCode: "osobni-odber", shippingMethodLabel: "Osobní odběr", paymentMethodCode: "prevod", paymentMethodLabel: "Bankovní převod",
      paymentStatus: "unpaid", orderedAt: new Date("2026-11-08T12:00:00Z"), subtotalKc: 379, discountKc: 0, shippingKc: 0, totalKc: 379,
      customerNote: null, items: [{ name: "Kulajda – Begina 3 l", quantity: 1, unitPriceKc: 379, lineTotalKc: 379 }],
    } as EmailOrder;
    const mail = customerOrderEmail(order, { baseUrl: "https://begina.cz", withheld: [], test: false, transfer: null, qrContentId: null });
    expect(mail.text.startsWith("Dobrý den, pane Průcho,")).toBe(true);
    expect(mail.text).not.toContain("Jiří Průcha,");
  });
});
