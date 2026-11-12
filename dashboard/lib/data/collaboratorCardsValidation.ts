import { z } from "zod";

export const LUCIE_COLLABORATOR_CARD_ID = "6c756369-652d-4000-8000-000000000001";

const positiveInt = z.coerce.number().int().min(0).max(1_000_000);

export const WORK_REWARD_TYPES = ["hourly", "per_post"] as const;
export type WorkRewardType = (typeof WORK_REWARD_TYPES)[number];

/** Částka = vždy sazba × množství — žádný nezávisle zadaný údaj (jde vždy dohledat výpočet). */
export function calculateWorkEarnedKc(rewardType: WorkRewardType, rateKc: number, postCount: number, durationMinutes: number): number {
  return rewardType === "hourly" ? Math.round((rateKc * durationMinutes) / 60) : rateKc * postCount;
}

const workEntryFieldsSchema = z.object({
  description: z.string().trim().min(1).max(500),
  postCount: positiveInt.max(1_000),
  durationMinutes: positiveInt.max(24 * 60),
  rewardType: z.enum(WORK_REWARD_TYPES),
  rateKc: z.coerce.number().int().min(1).max(1_000_000),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const workEntryInputSchema = workEntryFieldsSchema;
export const workEntryEditInputSchema = workEntryFieldsSchema.extend({ id: z.string().uuid() });
export const workEntryDeleteInputSchema = z.object({ id: z.string().uuid() });

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

export const inviteCollaboratorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
});

export function calculateCommissionKc(quantity: number, unitPriceKc: number, percent: number): number {
  return Math.round((quantity * unitPriceKc * percent) / 100);
}

