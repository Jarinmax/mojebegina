// ESHOP 1.0 — platby (lib/eshop/payments.ts): převod částky z formuláře.
// Zápis plateb a přepočet Zaplaceno ověřují stripe.test.ts (karta)
// a transferPayment.test.ts (ručně zapsaná platba) nad DB.
import { describe, expect, it } from "vitest";
import { parseAmountKcToHal } from "../payments";

describe("částka z formuláře → haléře", () => {
  it("celé koruny, desetinná čárka i tečka, mezery a „Kč“", () => {
    expect(parseAmountKcToHal("379")).toBe(37900);
    expect(parseAmountKcToHal("379,50")).toBe(37950);
    expect(parseAmountKcToHal("379.5")).toBe(37950);
    expect(parseAmountKcToHal("1 137,00 Kč")).toBe(113700);
    expect(parseAmountKcToHal("1 137")).toBe(113700);
  });

  it("odmítne nulu, záporné, víc než 2 desetinná místa a nesmysly", () => {
    for (const bad of ["", "0", "0,00", "-5", "1,234", "abc", "12e3", "10000000"]) {
      expect(parseAmountKcToHal(bad), bad).toBeNull();
    }
  });
});
