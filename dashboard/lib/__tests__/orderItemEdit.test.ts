import { describe, expect, it } from "vitest";
import { parseQuantity } from "../data/orderItemEditValidation";

describe("parseQuantity", () => {
  it("bere celá čísla 0–999", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity(" 0 ")).toBe(0);
    expect(parseQuantity(999)).toBe(999);
  });
  it("odmítne nesmysly", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("2.5")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("1000")).toBeNull();
  });
});
