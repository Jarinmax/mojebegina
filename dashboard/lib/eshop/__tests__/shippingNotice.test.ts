import { describe, expect, it } from "vitest";
import { activeShippingNotice } from "../shippingNotice";

const notice = { text: "X", until: "2026-11-25" };

describe("activeShippingNotice", () => {
  it("platí do konce 25. 11. pražského času", () => {
    expect(activeShippingNotice(new Date("2026-11-22T12:00:00Z"), notice)).toBe("X");
    expect(activeShippingNotice(new Date("2026-11-25T22:30:00Z"), notice)).toBe("X");
    expect(activeShippingNotice(new Date("2026-11-25T23:30:00Z"), notice)).toBeNull();
  });
  it("bez pruhu nic", () => {
    expect(activeShippingNotice(new Date(), null)).toBeNull();
  });
});
