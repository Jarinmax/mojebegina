"use server";

import { parseSubscribeForm } from "@/lib/eshop/newsletter";
import { requestSubscription } from "@/lib/eshop/newsletterServer";

export type SubscribeState = { status: "idle" } | { status: "error"; error: string } | { status: "sent" } | { status: "already" };

export async function subscribeNewsletterAction(_prev: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const parsed = parseSubscribeForm({
    email: formData.get("email"),
    segment: formData.get("segment"),
    source: formData.get("source"),
    trap: formData.get("web"),
  });
  if (parsed.ok === "bot") return { status: "sent" };
  if (!parsed.ok) return { status: "error", error: parsed.error };
  const result = await requestSubscription(parsed.value);
  if (!result.ok) return { status: "error", error: "Přihlášení se teď nepodařilo. Zkuste to prosím později nebo napište na info@begina.cz." };
  return result.status === "already_confirmed" ? { status: "already" } : { status: "sent" };
}
