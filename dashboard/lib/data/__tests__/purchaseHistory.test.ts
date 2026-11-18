import { describe, expect, it } from "vitest";
import { isGoodsLine, itemKey, matchPurchaseHistory, nameMatchKey, type HistoryInvoice } from "../purchaseHistory";

const inv = (number: string, day: string, who: Partial<HistoryInvoice>, items: [string, number][], totalKc = 100): HistoryInvoice => ({
  number, day, totalKc, email: null, name: null, ico: null, ...who, items: items.map(([name, quantity]) => ({ name, quantity })),
});

describe("historie nákupů: pomocné funkce", () => {
  it("jméno bez titulů, diakritiky a nezávisle na pořadí", () => {
    expect(nameMatchKey("Mgr. Karolína Pospíšilová")).toBe("karolina pospisilova");
    expect(nameMatchKey("POSPÍŠILOVÁ Karolína")).toBe("karolina pospisilova");
    expect(nameMatchKey("Karolína")).toBeNull();
    expect(nameMatchKey(null)).toBeNull();
  });
  it("doprava, sleva a obaly nejsou zboží; stejný výrobek se sečte", () => {
    expect(["Chlazená přeprava", "Doprava", "Sleva", "Krabice", "Zaokrouhlení"].map(isGoodsLine)).toEqual([false, false, false, false, false]);
    expect(isGoodsLine("Ledová káva 3 l")).toBe(true);
    expect(itemKey("Lipový sirup – 3 l")).toBe(itemKey("Lipový sirup 3 l"));
  });
});

describe("historie nákupů: párování", () => {
  const leads = [
    { id: "a", name: "Jana Nováková", email: "jana@example.cz" },
    { id: "b", name: "Petr Dvořák", email: "petr@example.cz" },
    { id: "c", name: "Eva Malá", email: "eva1@example.cz" },
    { id: "d", name: "Eva Malá", email: "eva2@example.cz" },
    { id: "e", name: "Bez Faktur", email: "nic@example.cz" },
  ];
  const invoices = [
    inv("1", "2025-05-02", { email: "JANA@example.cz", name: "Jana Nováková" }, [["Ledová káva 3 l", 2], ["Doprava", 1]], 900),
    inv("2", "2025-08-10", { name: "Nováková Jana" }, [["Bylinný čaj Šaman – 3 l", 3], ["Ledová káva 3 l", 1]], 1500),
    inv("3", "2026-01-15", { name: "Ing. Petr Dvořák" }, [["Lipový sirup 3 l", 1], ["Lipový sirup – 3 l", 2], ["Sleva", 1]], 1400),
    inv("4", "2026-02-01", { name: "Eva Malá" }, [["Kulajda 3 l", 1]], 379),
  ];
  const result = matchPurchaseHistory(leads, invoices);

  it("e-mail má přednost a přibere i faktury téhož jména bez e-mailu", () => {
    expect(result.get("a")).toEqual({
      matchedBy: "email", invoices: 2, totalKc: 2400, firstDay: "2025-05-02", lastDay: "2025-08-10",
      items: [
        { name: "Bylinný čaj Šaman – 3 l", quantity: 3, lastDay: "2025-08-10" },
        { name: "Ledová káva 3 l", quantity: 3, lastDay: "2025-08-10" },
      ],
    });
  });
  it("podle jména jen když je mezi kontakty jedinečné", () => {
    expect(result.get("b")).toMatchObject({ matchedBy: "name", invoices: 1, items: [{ name: "Lipový sirup – 3 l", quantity: 3 }] });
    expect(result.has("c")).toBe(false);
    expect(result.has("d")).toBe(false);
    expect(result.has("e")).toBe(false);
  });
});
