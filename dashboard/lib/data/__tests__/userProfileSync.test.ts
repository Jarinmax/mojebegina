import { describe, expect, it } from "vitest";
import { hasProfileChanged } from "../userProfileSync";

describe("hasProfileChanged — Security Phase 14", () => {
  it("1. žádný existující profil (chybí) = true, musí se založit", () => {
    expect(hasProfileChanged(null, { name: "Lucie", email: "l@example.com" })).toBe(true);
  });

  it("2. existující profil identický s příchozími daty = false, žádný zápis", () => {
    const snapshot = { name: "Lucie", email: "l@example.com" };
    expect(hasProfileChanged(snapshot, { ...snapshot })).toBe(false);
  });

  it("3. rozdílné jméno = true", () => {
    expect(
      hasProfileChanged(
        { name: "Lucie", email: "l@example.com" },
        { name: "Lucie Königsbergová", email: "l@example.com" }
      )
    ).toBe(true);
  });

  it("4. rozdílný e-mail = true", () => {
    expect(
      hasProfileChanged(
        { name: "Lucie", email: "l@example.com" },
        { name: "Lucie", email: "nova@example.com" }
      )
    ).toBe(true);
  });

  it("5. existující i příchozí jméno null = false (obě null není změna)", () => {
    expect(
      hasProfileChanged({ name: null, email: "l@example.com" }, { name: null, email: "l@example.com" })
    ).toBe(false);
  });

  it("6. existující jméno null, příchozí vyplněné = true", () => {
    expect(
      hasProfileChanged({ name: null, email: "l@example.com" }, { name: "Lucie", email: "l@example.com" })
    ).toBe(true);
  });
});
