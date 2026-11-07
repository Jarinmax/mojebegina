import { describe, expect, it } from "vitest";
import {
  calculateCommissionKc,
  productMovementInputSchema,
  workEntryInputSchema,
} from "../collaboratorCardsValidation";

describe("karta spolupracovnice", () => {
  it("počítá 20% provizi z prodaných kusů a ceny", () => {
    expect(calculateCommissionKc(3, 250, 20)).toBe(150);
    expect(calculateCommissionKc(1, 199, 20)).toBe(40);
  });

  it("prodej bez ceny odmítne, naskladnění bez ceny přijme", () => {
    expect(productMovementInputSchema.safeParse({
      productId: "6c756369-652d-4000-8000-000000000101",
      kind: "sale",
      quantity: 2,
    }).success).toBe(false);
    expect(productMovementInputSchema.safeParse({
      productId: "6c756369-652d-4000-8000-000000000101",
      kind: "stock_in",
      quantity: 20,
    }).success).toBe(true);
  });

  it("zápis práce hlídá počet, čas, odměnu a datum", () => {
    expect(workEntryInputSchema.safeParse({
      description: "Příspěvek o medových svíčkách",
      postCount: 1,
      durationMinutes: 45,
      earnedKc: 300,
      occurredOn: "2026-11-07",
    }).success).toBe(true);
    expect(workEntryInputSchema.safeParse({
      description: "",
      postCount: -1,
      durationMinutes: -2,
      earnedKc: -10,
      occurredOn: "dnes",
    }).success).toBe(false);
  });
});

