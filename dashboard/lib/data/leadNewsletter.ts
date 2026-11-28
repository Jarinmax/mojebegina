import "server-only";

// Newsletter u leadu (28. 11. 2026): obchodník se při hovoru zeptá „Můžu vám
// posílat novinky?“ a na „ano“ odešle zákazníkovi potvrzovací e-mail.
// Souhlas platí až po kliknutí zákazníka (double opt-in) — obchodník ho sám
// nezaškrtne. Do historie leadu se zapíše, kdo e-mail poslal.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, leadActivity } from "@/lib/db/schema";
import { requireCrmContext } from "./leads";
import { normalizeEmail, parseSegment, SEGMENT_LABELS } from "@/lib/eshop/newsletter";
import { getSubscriber, requestSubscription, type SubscriberInfo } from "@/lib/eshop/newsletterServer";

export async function getLeadNewsletterStatus(email: string | null): Promise<SubscriberInfo | null> {
  const normalized = normalizeEmail(email);
  return normalized ? getSubscriber(normalized) : null;
}

export type LeadNewsletterResult = { ok: true; message: string } | { ok: false; error: string };

export async function sendLeadNewsletterConfirmation(leadId: string, rawSegment: unknown): Promise<LeadNewsletterResult> {
  const ctx = await requireCrmContext();
  const segment = parseSegment(rawSegment);
  if (!segment) return { ok: false, error: "Vyber, jestli je to kavárna/bistro, nebo domácnost." };
  const [lead] = await db.select({ id: leads.id, email: leads.contactEmail }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { ok: false, error: "Lead nebyl nalezen." };
  const email = normalizeEmail(lead.email);
  if (!email) return { ok: false, error: "Lead nemá platný e-mail – doplň ho a zkus to znovu." };

  const result = await requestSubscription({ email, segment, source: "crm", leadId, requestedByUserId: ctx.userId, requestedByName: ctx.name });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.status === "already_confirmed") return { ok: true, message: "Odběr už má potvrzený – nic dalšího není potřeba." };
  if (result.status === "recently_sent") return { ok: true, message: "Potvrzovací e-mail odešel před chvílí – zkus to znovu za 10 minut." };

  await db.insert(leadActivity).values({
    leadId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "note_added",
    body: `Newsletter: souhlas po telefonu (${SEGMENT_LABELS[segment]}) – odeslán potvrzovací e-mail na ${email}. Platí až po potvrzení zákazníkem.`,
  });
  return { ok: true, message: `Potvrzovací e-mail odešel na ${email}. Odběr platí, až ho zákazník potvrdí.` };
}
