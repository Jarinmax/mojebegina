// Žádost o hodnocení „Jak vám chutná begina?“ (zadání Lucie 17. 11. 2026) —
// Vercel Cron denně 10:00 UTC (11:00 / 12:00 pražského času). 7 dní po
// doručení objednávky z e-shopu, jen jednou na objednávku, ne odhlášeným.
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { emailConfig, invoiceCopyRecipients, resolveRecipients } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { REVIEW_EMAILS_ENABLED, optoutToken, reviewRequestEmail, reviewSecret, reviewToken } from "@/lib/eshop/reviews";
import { claimReviewRequest, dueReviewRequests, releaseReviewRequest } from "@/lib/eshop/reviewsServer";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";

const SAMPLE_CODE = "ukazka-8hq2m5x4";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Ukázka pro Beginu: přesně ten e-mail, který dostane zákazník, jen na
  // interní adresu (info@begina.cz). Zákazníkům nic; odkazy jsou ukázkové.
  // Jde spustit i bez tajemství cronu pevným kódem — víc než ukázku na
  // info@ (nejvýš jednu za hodinu) tím nikdo neodešle.
  const nahled = new URL(request.url).searchParams.get("nahled");
  const cronSecret = process.env.CRON_SECRET;
  const authorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (nahled === SAMPLE_CODE || (authorized && nahled === "1")) {
    const config = emailConfig();
    const secret = reviewSecret();
    if (!config || !secret || config.internalTo.length === 0) return Response.json({ nahled: false, reason: "e-mail není nastaven" });
    const email = reviewRequestEmail({
      customerName: "Jana Nováková",
      reviewUrl: `${PUBLIC_ORIGIN}/hodnoceni/${reviewToken("00000000-0000-4000-8000-000000000000", secret)}`,
      optoutUrl: `${PUBLIC_ORIGIN}/odhlaseni/${optoutToken("ukazka@begina.cz", secret)}`,
    });
    const result = await resendTransport(config.apiKey)(
      { from: config.from, to: config.internalTo, replyTo: config.replyTo, subject: email.subject, html: email.html, text: email.text },
      `hodnoceni-nahled-${new Date().toISOString().slice(0, 13)}`,
    );
    return Response.json({ nahled: result.ok, error: result.ok ? undefined : result.error.slice(0, 200) });
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });
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
