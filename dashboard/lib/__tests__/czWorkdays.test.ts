import { describe, it, expect } from "vitest";
import { addCzWorkdays, formatDeadlineLong } from "@/lib/czWorkdays";
describe("pracovní dny ČR", () => { it("5 pracovních dnů přes víkendy, Vánoce a Velikonoce", () => {
  expect(formatDeadlineLong(addCzWorkdays(new Date("2026-11-18T09:31:47Z"), 5))).toBe("středa 25. 11.");
  expect(addCzWorkdays(new Date("2026-12-21T10:00:00Z"), 5).toISOString().slice(0,10)).toBe("2026-12-30");
  expect(addCzWorkdays(new Date("2027-03-25T10:00:00Z"), 5).toISOString().slice(0,10)).toBe("2027-04-05");
});});
