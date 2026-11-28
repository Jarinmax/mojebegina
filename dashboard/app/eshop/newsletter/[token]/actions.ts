"use server";

import { headers } from "next/headers";
import { emailFromNewsletterToken, reviewSecret } from "@/lib/eshop/reviews";
import { confirmSubscription } from "@/lib/eshop/newsletterServer";

export type ConfirmState = { status: "idle" } | { status: "error" } | { status: "done" } | { status: "expired" };

export async function confirmNewsletterAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const token = formData.get("token");
  const secret = reviewSecret();
  const email = secret && typeof token === "string" ? emailFromNewsletterToken(token, secret) : null;
  if (!email) return { status: "error" };
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const result = await confirmSubscription(email, { ip, userAgent: h.get("user-agent") });
    return result === "not_found" ? { status: "expired" } : { status: "done" };
  } catch {
    return { status: "error" };
  }
}
