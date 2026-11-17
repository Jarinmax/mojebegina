// Žádost o hodnocení „Jak vám chutná begina?“ (zadání Lucie 17. 11. 2026) —
// Vercel Cron denně 10:00 UTC (11:00 / 12:00 pražského času). 7 dní po
// doručení objednávky z e-shopu, jen jednou na objednávku, ne odhlášeným.
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { emailConfig, invoiceCopyRecipients, resolveRecipients } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { REVIEW_EMAILS_ENABLED, optoutToken, reviewRequestEmail, reviewSecret, reviewToken } from "@/lib/eshop/reviews";
import { claimReviewRequest, dueReviewRequests, releaseReviewRequest } from "@/lib/eshop/reviewsServer";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!REVIEW_EMAILS_ENABLED) return Response.json({ sent: 0, reason: "odesílání ještě není zapnuté" });
  const config = emailConfig();
  const secret = reviewSecret();
  if (!config || !secret) return Response.json({ sent: 0, reason: "e-mail není nastaven" });
  const due = await dueReviewRequests();
  const send = resendTransport(config.apiKey);
  let sent = 0;
  let failed = 0;
  for (const item of due) {
    if (!(await claimReviewRequest(item.orderId))) continue;
    const { to, withheld } = resolveRecipients([item.email], config);
    const email = reviewRequestEmail({
      customerName: item.customerName,
      reviewUrl: `${PUBLIC_ORIGIN}/hodnoceni/${encodeURIComponent(reviewToken(item.orderId, secret))}`,
      optoutUrl: `${PUBLIC_ORIGIN}/odhlaseni/${encodeURIComponent(optoutToken(item.email, secret))}`,
      test: config.testRecipients !== null || withheld.length > 0,
    });
    const result = await send(
      { from: config.from, to, bcc: invoiceCopyRecipients(config, to), replyTo: config.replyTo, subject: email.subject, html: email.html, text: email.text },
      `hodnoceni-${item.orderId}`,
    );
    if (result.ok) sent += 1;
    else {
      failed += 1;
      await releaseReviewRequest(item.orderId);
      console.error("Hodnocení: žádost se nepodařilo odeslat", result.error.slice(0, 200));
    }
  }
  return Response.json({ sent, failed, due: due.length });
}
