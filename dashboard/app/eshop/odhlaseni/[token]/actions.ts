"use server";

import { emailFromOptoutToken, reviewSecret } from "@/lib/eshop/reviews";
import { addEmailOptout } from "@/lib/eshop/reviewsServer";

export type OptoutState = { status: "idle" } | { status: "error" } | { status: "done" };

export async function optoutAction(_prev: OptoutState, formData: FormData): Promise<OptoutState> {
  const token = formData.get("token");
  const secret = reviewSecret();
  const email = secret && typeof token === "string" ? emailFromOptoutToken(token, secret) : null;
  if (!email) return { status: "error" };
  try {
    await addEmailOptout(email);
  } catch {
    return { status: "error" };
  }
  return { status: "done" };
}
