import { describe, expect, it } from "vitest";
import {
  calculateCommissionKc,
  calculateWorkEarnedKc,
  inviteCollaboratorInputSchema,
  productMovementInputSchema,
  workEntryDeleteInputSchema,
  workEntryEditInputSchema,
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

  it("zápis práce hlídá počet, čas, typ odměny, sazbu a datum", () => {
    expect(workEntryInputSchema.safeParse({
      description: "Příspěvek o medových svíčkách",
      postCount: 1,
      durationMinutes: 45,
      rewardType: "per_post",
      rateKc: 300,
      occurredOn: "2026-11-07",
    }).success).toBe(true);
    expect(workEntryInputSchema.safeParse({
      description: "",
      postCount: -1,
      durationMinutes: -2,
      rewardType: "per_post",
      rateKc: -10,
      occurredOn: "dnes",
    }).success).toBe(false);
    expect(workEntryInputSchema.safeParse({
      description: "Chybí sazba",
      postCount: 1,
      durationMinutes: 10,
      rewardType: "hourly",
      rateKc: 0,
      occurredOn: "2026-11-07",
    }).success).toBe(false);
  });

  it("částka je vždy sazba × množství — hodinovka podle minut, příspěvek podle počtu", () => {
    expect(calculateWorkEarnedKc("hourly", 300, 1, 90)).toBe(450); // 300 Kč/h × 1,5 h
    expect(calculateWorkEarnedKc("hourly", 300, 1, 45)).toBe(225); // 300 Kč/h × 45 min (0,75 h)
    expect(calculateWorkEarnedKc("per_post", 200, 3, 0)).toBe(600);
  });

  it("úprava záznamu vyžaduje i jeho id; smazání jen id", () => {
    expect(workEntryEditInputSchema.safeParse({
      id: "6c756369-652d-4000-8000-000000000101",
      description: "Oprava popisu",
      postCount: 2,
      durationMinutes: 0,
      rewardType: "per_post",
      rateKc: 150,
      occurredOn: "2026-11-10",
    }).success).toBe(true);
    expect(workEntryEditInputSchema.safeParse({
      description: "Bez id",
      postCount: 2,
      durationMinutes: 0,
      rewardType: "per_post",
      rateKc: 150,
      occurredOn: "2026-11-10",
    }).success).toBe(false);
    expect(workEntryDeleteInputSchema.safeParse({ id: "6c756369-652d-4000-8000-000000000101" }).success).toBe(true);
    expect(workEntryDeleteInputSchema.safeParse({ id: "neni-uuid" }).success).toBe(false);
  });

  it("pozvání spolupracovnice vyžaduje jméno a platný e-mail; e-mail se ořízne a dá na malá písmena", () => {
    const parsed = inviteCollaboratorInputSchema.safeParse({ name: "Lucie Nováková", email: " Lucie@Example.cz " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("lucie@example.cz");
    expect(inviteCollaboratorInputSchema.safeParse({ name: "", email: "lucie@example.cz" }).success).toBe(false);
    expect(inviteCollaboratorInputSchema.safeParse({ name: "Lucie", email: "neplatny-email" }).success).toBe(false);
  });
});

