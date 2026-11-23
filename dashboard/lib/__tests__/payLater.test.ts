import { describe, expect, it } from "vitest";
import { isPayLater } from "../payLater";

describe("isPayLater", () => {
  it("ruční platba při předání jde do výroby hned", () => {
    expect(isPayLater(null, "hotově")).toBe(true);
    expect(isPayLater(null, "Hotově při předání")).toBe(true);
    expect(isPayLater(null, "převodem na fakturu")).toBe(true);
    expect(isPayLater(null, "dobírkou")).toBe(true);
  });
  it("e-shop a platba předem čeká na zaplacení", () => {
    expect(isPayLater("prevod", "Bankovní převod — platba předem")).toBe(false);
    expect(isPayLater("karta", "Kartou online")).toBe(false);
    expect(isPayLater(null, null)).toBe(false);
    expect(isPayLater(null, "kartou")).toBe(false);
  });
});
