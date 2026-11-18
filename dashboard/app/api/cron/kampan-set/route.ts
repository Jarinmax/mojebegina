// Kampaň „Ochutnávkový set sirupů“ (zadání Lucie 17. 11. 2026) — tři běhy:
//   ?beh=kod     denně: e-mail se slevovým kódem 5 dní po odeslání setu
//                (jednou na objednávku, ne odhlášeným),
//   ?beh=provize 1. den v měsíci v 11:00 pražského času: přehled provize
//                za minulý měsíc na info@begina.cz,
//   ?beh=sobota  v sobotu v 10:30 pražského času: přehled kampaně na info@.
// Vercel Cron běží v UTC, proto jsou provize a sobota naplánované dvakrát
// (zimní a letní čas) a odešlou se jen v běhu se správnou pražskou hodinou.
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { emailConfig, invoiceCopyRecipients, resolveRecipients } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { pragueDate, pragueHour } from "@/lib/eshop/overdueOrders";
import { optoutToken, reviewSecret } from "@/lib/eshop/reviews";
import { SET_COUPON_EMAILS_ENABLED, commissionEmail, couponEmail, previousMonth, saturdayEmail } from "@/lib/eshop/setCampaign";
import { claimCouponEmail, dueCouponEmails, loadCampaignStats, loadCommission, releaseCouponEmail } from "@/lib/eshop/setCampaignServer";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";

/** Ukázka e-mailu s kódem na info@begina.cz (přesně to, co dostane zákazník). */
const SAMPLE_CODE = "ukazka-kod-4t7w2n9c";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const authorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const config = emailConfig();
  const now = new Date();
  const today = pragueDate(now);

  if (url.searchParams.get("nahled") === SAMPLE_CODE) {
    const secret = reviewSecret();
    if (!config || !secret || config.internalTo.length === 0) return Response.json({ nahled: false, reason: "e-mail není nastaven" });
    const email = couponEmail({ customerName: "Jana Nováková", shopUrl: PUBLIC_ORIGIN, optoutUrl: `${PUBLIC_ORIGIN}/odhlaseni/${optoutToken("ukazka@begina.cz", secret)}` });
    const result = await resendTransport(config.apiKey)(
      { from: config.from, to: config.internalTo, replyTo: config.replyTo, ...email },
      `kampan-set-nahled-${now.toISOString().slice(0, 13)}`,
    );
    return Response.json({ nahled: result.ok, error: result.ok ? undefined : result.error.slice(0, 200) });
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });
  const beh = url.searchParams.get("beh");
  const force = url.searchParams.get("vynutit") === "1";

  if (beh === "kod") {
    if (!SET_COUPON_EMAILS_ENABLED) return Response.json({ sent: 0, reason: "odesílání ještě není zapnuté" });
    const secret = reviewSecret();
    if (!config || !secret) return Response.json({ sent: 0, reason: "e-mail není nastaven" });
    const due = await dueCouponEmails();
    const send = resendTransport(config.apiKey);
    let sent = 0;
    let failed = 0;
    for (const item of due) {
      if (!(await claimCouponEmail(item.orderId))) continue;
      const { to, withheld } = resolveRecipients([item.email], config);
      const email = couponEmail({
        customerName: item.customerName,
        shopUrl: PUBLIC_ORIGIN,
        optoutUrl: `${PUBLIC_ORIGIN}/odhlaseni/${encodeURIComponent(optoutToken(item.email, secret))}`,
        test: config.testRecipients !== null || withheld.length > 0,
      });
      const result = await send(
        { from: config.from, to, bcc: invoiceCopyRecipients(config, to), replyTo: config.replyTo, ...email },
        `kampan-set-kod-${item.orderId}`,
      );
      if (result.ok) sent += 1;
      else {
        failed += 1;
        await releaseCouponEmail(item.orderId);
        console.error("Kampaň set: e-mail s kódem se nepodařilo odeslat", result.error.slice(0, 200));
      }
    }
    return Response.json({ sent, failed, due: due.length });
  }

  if (beh === "provize" || beh === "sobota") {
    const wantedHour = beh === "provize" ? 11 : 10;
    if (!force && pragueHour(now) !== wantedHour) return Response.json({ sent: false, reason: `v Praze není ${wantedHour} h` });
    if (!force && beh === "provize" && !today.endsWith("-01")) return Response.json({ sent: false, reason: "není 1. den v měsíci" });
    if (!config || config.internalTo.length === 0) return Response.json({ sent: false, reason: "e-mail není nastaven" });
    const email = beh === "provize" ? commissionEmail(await loadCommission(previousMonth(today))) : saturdayEmail(await loadCampaignStats());
    const result = await resendTransport(config.apiKey)(
      { from: config.from, to: config.internalTo, replyTo: config.replyTo, ...email },
      `kampan-set-${beh}-${today}`,
    );
    if (!result.ok) console.error("Kampaň set: přehled se nepodařilo odeslat", result.error.slice(0, 200));
    return Response.json({ sent: result.ok });
  }
  return Response.json({ error: "neznámý běh" }, { status: 400 });
}
