import "server-only";

// Newsletter – souhlasy v DB a potvrzovací e-mail (viz newsletter.ts).
// Odolné vůči chybějící tabulce (SQL 182 ještě neproběhlo): web pak hlásí
// „nepodařilo se“, ale nic jiného nespadne.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailConfig, invoiceCopyRecipients, invoiceEmailSender, resolveRecipients } from "./email/config";
import { resendTransport } from "./email/resend";
import { canResendConfirmation, CONSENT_TEXT, confirmationEmail, type NewsletterSegment, type NewsletterSource, type NewsletterStatus } from "./newsletter";
import { newsletterToken, optoutToken, reviewSecret } from "./reviews";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";

type Row = Record<string, unknown>;
const rowsOf = (result: { rows?: unknown[] }) => (result.rows ?? []) as Row[];
const dateOf = (value: unknown): Date | null => (value ? new Date(String(value)) : null);

export type SubscriberInfo = {
  email: string;
  segment: NewsletterSegment | null;
  status: NewsletterStatus;
  source: NewsletterSource;
  requestedAt: Date;
  requestedByName: string | null;
  confirmSentAt: Date | null;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

function toInfo(row: Row): SubscriberInfo {
  return {
    email: String(row.email),
    segment: (row.segment as NewsletterSegment | null) ?? null,
    status: row.status as NewsletterStatus,
    source: row.source as NewsletterSource,
    requestedAt: new Date(String(row.requested_at)),
    requestedByName: (row.requested_by_name as string | null) ?? null,
    confirmSentAt: dateOf(row.confirm_sent_at),
    confirmedAt: dateOf(row.confirmed_at),
    unsubscribedAt: dateOf(row.unsubscribed_at),
  };
}

export async function getSubscriber(email: string): Promise<SubscriberInfo | null> {
  try {
    const result = await db.execute(sql`SELECT * FROM newsletter_subscribers WHERE email = ${email.trim().toLowerCase()} LIMIT 1`);
    const row = rowsOf(result)[0];
    return row ? toInfo(row) : null;
  } catch {
    return null;
  }
}

export type RequestInput = {
  email: string;
  segment: NewsletterSegment | null;
  source: NewsletterSource;
  leadId?: string | null;
  requestedByUserId?: string | null;
  requestedByName?: string | null;
};

export type RequestResult =
  | { ok: true; status: "sent" | "already_confirmed" | "recently_sent" }
  | { ok: false; error: string };

/**
 * Žádost o odběr: uloží / obnoví řádek jako „čeká na potvrzení“ a pošle
 * potvrzovací e-mail. Potvrzená adresa zůstane potvrzená (jen se doplní
 * segment). Nová žádost po odhlášení je nový souhlas → znovu „pending“.
 */
export async function requestSubscription(input: RequestInput): Promise<RequestResult> {
  const config = emailConfig();
  const secret = reviewSecret();
  if (!config || !secret) return { ok: false, error: "Odesílání e-mailů není nastavené." };

  const email = input.email.trim().toLowerCase();
  const existing = await getSubscriber(email);
  if (existing?.status === "confirmed") {
    if (input.segment && input.segment !== existing.segment) {
      await db.execute(sql`UPDATE newsletter_subscribers SET segment = ${input.segment}, updated_at = now() WHERE email = ${email}`);
    }
    return { ok: true, status: "already_confirmed" };
  }
  if (existing?.status === "pending" && !canResendConfirmation(existing.confirmSentAt)) return { ok: true, status: "recently_sent" };

  try {
    await db.execute(sql`
      INSERT INTO newsletter_subscribers (email, segment, status, source, consent_text, lead_id, requested_by_user_id, requested_by_name)
      VALUES (${email}, ${input.segment}, 'pending', ${input.source}, ${CONSENT_TEXT}, ${input.leadId ?? null}::uuid, ${input.requestedByUserId ?? null}, ${input.requestedByName ?? null})
      ON CONFLICT (email) DO UPDATE SET
        segment = COALESCE(EXCLUDED.segment, newsletter_subscribers.segment),
        status = 'pending', source = EXCLUDED.source, consent_text = EXCLUDED.consent_text,
        lead_id = COALESCE(EXCLUDED.lead_id, newsletter_subscribers.lead_id),
        requested_by_user_id = EXCLUDED.requested_by_user_id, requested_by_name = EXCLUDED.requested_by_name,
        requested_at = now(), unsubscribed_at = NULL, updated_at = now()
    `);
  } catch (error) {
    console.error("Newsletter: žádost se nepodařilo uložit", error);
    return { ok: false, error: "Uložení se nepodařilo." };
  }

  const { to, withheld } = resolveRecipients([email], config);
  const message = confirmationEmail({
    segment: input.segment ?? existing?.segment ?? null,
    source: input.source,
    confirmUrl: `${PUBLIC_ORIGIN}/newsletter/${encodeURIComponent(newsletterToken(email, secret))}`,
    test: config.testRecipients !== null || withheld.length > 0,
  });
  const sender = invoiceEmailSender(config);
  const sent = await resendTransport(config.apiKey)(
    { from: sender.from, to, bcc: invoiceCopyRecipients(config, to), replyTo: sender.replyTo, subject: message.subject, html: message.html, text: message.text },
    `newsletter-potvrzeni-${email}-${new Date().toISOString().slice(0, 15)}`,
  );
  if (!sent.ok) {
    console.error("Newsletter: potvrzovací e-mail neodešel", sent.error.slice(0, 200));
    return { ok: false, error: "Potvrzovací e-mail se nepodařilo odeslat." };
  }
  await db.execute(sql`UPDATE newsletter_subscribers SET confirm_sent_at = now() WHERE email = ${email}`);
  return { ok: true, status: "sent" };
}

/** Kliknutí na „Potvrdit odběr“. Odhlášenou adresu to vrátí jen přes novou žádost (ne starým odkazem). */
export async function confirmSubscription(email: string, meta: { ip: string | null; userAgent: string | null }): Promise<"confirmed" | "already" | "not_found"> {
  const result = await db.execute(sql`
    UPDATE newsletter_subscribers
    SET status = 'confirmed', confirmed_at = now(), confirmed_ip = ${meta.ip}, confirmed_user_agent = ${meta.userAgent?.slice(0, 300) ?? null}, updated_at = now()
    WHERE email = ${email} AND status = 'pending'
    RETURNING email
  `);
  if (rowsOf(result).length === 1) return "confirmed";
  const current = await getSubscriber(email);
  return current?.status === "confirmed" ? "already" : "not_found";
}

/** Odhlášení ze všech obchodních sdělení (volá addEmailOptout). */
export async function markUnsubscribed(email: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now() WHERE email = ${email.trim().toLowerCase()} AND status <> 'unsubscribed'`);
  } catch {
    // tabulka zatím nemusí existovat — odhlášení z ostatních sdělení proběhlo
  }
}

/** Odkaz na odhlášení do každého newsletteru (stejný jako u ostatních sdělení). */
export function newsletterOptoutUrl(email: string): string | null {
  const secret = reviewSecret();
  return secret ? `${PUBLIC_ORIGIN}/odhlaseni/${encodeURIComponent(optoutToken(email, secret))}` : null;
}
