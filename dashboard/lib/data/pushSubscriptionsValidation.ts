// Jarda — upozornění na naplánovaný hovor 1.0. Čistá validace tvaru, jaký
// vrací prohlížečovo PushManager.subscribe() (PushSubscriptionJSON):
// endpoint (vždy https URL), keys.p256dh, keys.auth.
import { z } from "zod";

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().trim().url().max(2000),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeInputSchema = z.object({
  endpoint: z.string().trim().url().max(2000),
});
