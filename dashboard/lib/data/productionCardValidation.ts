import { z } from "zod";

export const PETR_PRODUCTION_CARD_ID = "70657472-2d76-4000-8000-000000000001";

export const stockRequestInputSchema = z.object({
  stockItemId: z.string().uuid().optional(),
  note: z.string().trim().min(1).max(500),
});
