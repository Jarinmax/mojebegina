import { z } from "zod";

export const LUCIE_COLLABORATOR_CARD_ID = "6c756369-652d-4000-8000-000000000001";

const positiveInt = z.coerce.number().int().min(0).max(1_000_000);

export const workEntryInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  postCount: positiveInt.max(1_000),
  durationMinutes: positiveInt.max(24 * 60),
  earnedKc: positiveInt,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const productMovementInputSchema = z.object({
  productId: z.string().uuid(),
  kind: z.enum(["stock_in", "sale"]),
  quantity: z.coerce.number().int().min(1).max(100_000),
  unitSalePriceKc: positiveInt.optional(),
  note: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "sale" && value.unitSalePriceKc === undefined) {
    ctx.addIssue({ code: "custom", path: ["unitSalePriceKc"], message: "U prodeje je nutná prodejní cena za kus." });
  }
});

export const payoutInputSchema = z.object({
  amountKc: z.coerce.number().int().min(1).max(10_000_000),
  note: z.string().trim().max(500).optional(),
});

export const assignmentInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export function calculateCommissionKc(quantity: number, unitPriceKc: number, percent: number): number {
  return Math.round((quantity * unitPriceKc * percent) / 100);
}

