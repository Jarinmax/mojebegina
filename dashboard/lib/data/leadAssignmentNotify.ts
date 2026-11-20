import "server-only";
import { createHash } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, leadActivity } from "@/lib/db/schema";
import { getAppOrigin } from "@/lib/appOrigin";
import { DEFAULT_INTERNAL_EMAIL, emailConfig, invoiceCopyRecipients, resolveRecipients } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { getUserProfile } from "./userProfiles";
import { buildLeadAssignmentEmail } from "./leadAssignmentEmail";

const SOURCE_TEXT: Record<string, string> = {
  web_kavarny: "web – stránka Pro kavárny a bistra",
  meta: "Meta (Facebook/Instagram)",
};

/** E-mail přiřazenému obchodníkovi. Selhání přiřazení nezruší (lead je v CRM), jen se zaloguje. */
export async function notifyLeadOwner(leadId: string, ownerUserId: string, assignedBy: string, assignedAt: Date): Promise<boolean> {
  try {
    const config = emailConfig();
    if (!config) return false;
    const owner = await getUserProfile(ownerUserId);
    if (!owner?.email) return false;
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return false;
    const [created] = await db
      .select({ body: leadActivity.body })
      .from(leadActivity)
      .where(and(eq(leadActivity.leadId, leadId), eq(leadActivity.kind, "created")))
      .orderBy(asc(leadActivity.createdAt))
      .limit(1);
    const origin = await getAppOrigin();
    const mail = buildLeadAssignmentEmail({
      ownerName: owner.name ?? owner.email,
      assignedBy,
      displayName: lead.companyName ?? lead.contactName ?? "Lead",
      contactName: lead.contactName,
      phone: lead.contactPhone,
      email: lead.contactEmail,
      city: lead.city,
      sourceLabel: SOURCE_TEXT[lead.source] ?? null,
      formNote: created?.body ?? null,
      leadUrl: `${origin}/rizeni-firmy/obchod/leady/${leadId}`,
      promisedReply: lead.source in SOURCE_TEXT,
    });
    const recipients = resolveRecipients([owner.email], config);
    const key = createHash("sha256").update(`${leadId}|${ownerUserId}|${assignedAt.toISOString()}`).digest("hex").slice(0, 40);
    const sent = await resendTransport(config.apiKey)(
      {
        from: config.from,
        to: recipients.to,
        bcc: invoiceCopyRecipients(config, recipients.to),
        replyTo: DEFAULT_INTERNAL_EMAIL, // Lucie 20. 11.: odpověď obchodníka jde Begině, ne zákazníkovi
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      },
      `lead-assign-${key}`
    );
    if (!sent.ok) console.error("Lead: upozornění obchodníkovi se nepodařilo odeslat", sent.error.slice(0, 200));
    return sent.ok;
  } catch (error) {
    console.error("Lead: upozornění obchodníkovi selhalo", error instanceof Error ? error.message.slice(0, 200) : error);
    return false;
  }
}
