// ESHOP 1.0 — obsah e-mailů k objednávce (čisté funkce, bez I/O).
//
// Zákazník: potvrzení přijetí objednávky. Stav platby se bere VÝHRADNĚ
// z objednávky v DB — „Zaplaceno“ jen když payment_status = 'paid' (u karty
// to nastavuje až ověřený webhook Stripe).
// Begina: stručné interní upozornění s odkazem na detail v MojeBegina.
import { formatKc } from "@/lib/format";
import { getShippingMethod } from "../shipping";
import { formatIban, formatPragueDate, type TransferInfo } from "../bankTransfer";

export type EmailOrder = {
  id: string;
  orderNumber: number | null;
  paymentVs: string | null;
  contactName: string | null;
  contactEmail: string | null;
  recipientAddress: string | null;
  shippingMethodCode: string | null;
  shippingMethodLabel: string | null;
  paymentMethodCode: string | null;
  paymentMethodLabel: string | null;
  paymentStatus: string;
  orderedAt: Date;
  subtotalKc: number;
  discountKc: number;
  shippingKc: number;
  totalKc: number;
  customerNote: string | null;
  items: { name: string; quantity: number; unitPriceKc: number; lineTotalKc: number }[];
};

export type RenderedEmail = { subject: string; html: string; text: string };

type Context = {
  baseUrl: string;
  /** Testovací režim: komu by e-mail šel v ostrém provozu (prázdné = ostrý / povolený příjemce). */
  withheld: string[];
  /** true = Preview (testovací režim) — předmět dostane [TEST]. */
  test: boolean;
};

/** Číslo objednávky, dokud není číslování zapnuté, krátká reference z id. */
export function orderReference(order: Pick<EmailOrder, "id" | "orderNumber">): string {
  return order.orderNumber !== null ? String(order.orderNumber) : order.id.slice(0, 8);
}

export function paymentStateLabel(order: Pick<EmailOrder, "paymentStatus" | "paymentMethodCode">): string {
  if (order.paymentStatus === "paid") {
    return order.paymentMethodCode === "karta" ? "Zaplaceno kartou" : "Zaplaceno";
  }
  if (order.paymentStatus === "refunded") return "Vráceno";
  return order.paymentMethodCode === "karta" ? "Čeká na platbu kartou" : "Čeká na platbu převodem";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deliveryText(order: EmailOrder): string {
  const method = order.shippingMethodLabel ?? "Doprava";
  if (order.recipientAddress) return `${method} — ${order.recipientAddress}`;
  const description = order.shippingMethodCode ? getShippingMethod(order.shippingMethodCode)?.description : undefined;
  return description ? `${method} — ${description}` : method;
}

function subjectPrefix(ctx: Context): string {
  return ctx.test ? "[TEST] " : "";
}

// ---------- společné kusy HTML ----------

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function testBanner(ctx: Context): string {
  if (!ctx.test) return "";
  const target = ctx.withheld.length > 0 ? `V ostrém provozu by šel na: <strong>${escapeHtml(ctx.withheld.join(", "))}</strong>.` : "";
  return `<tr><td style="background:#FCE2E1;color:#B40001;padding:10px 16px;font-size:13px;border-radius:8px;">
TESTOVACÍ E-MAIL z Preview (MojeBegina). ${target}</td></tr><tr><td style="height:16px"></td></tr>`;
}

function testBannerText(ctx: Context): string {
  if (!ctx.test) return "";
  const target = ctx.withheld.length > 0 ? ` V ostrém provozu by šel na: ${ctx.withheld.join(", ")}.` : "";
  return `*** TESTOVACÍ E-MAIL z Preview (MojeBegina).${target} ***\n\n`;
}

function itemsTable(order: EmailOrder): string {
  const row = (left: string, right: string, bold = false) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #EDEDED;${bold ? "font-weight:600;" : ""}">${left}</td>` +
    `<td style="padding:6px 0;border-bottom:1px solid #EDEDED;text-align:right;white-space:nowrap;${bold ? "font-weight:600;" : ""}">${right}</td></tr>`;
  const lines = order.items.map((item) =>
    row(`${item.quantity}× ${escapeHtml(item.name)}`, escapeHtml(formatKc(item.lineTotalKc)))
  );
  if (order.discountKc > 0) lines.push(row("Sleva", escapeHtml(`−${formatKc(order.discountKc)}`)));
  lines.push(row(escapeHtml(order.shippingMethodLabel ?? "Doprava"), escapeHtml(order.shippingKc > 0 ? formatKc(order.shippingKc) : "zdarma")));
  lines.push(row("Celkem", escapeHtml(formatKc(order.totalKc)), true));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#1A1A1A;">${lines.join("")}</table>`;
}

function itemsText(order: EmailOrder): string {
  const lines = order.items.map((item) => `- ${item.quantity}× ${item.name}: ${formatKc(item.lineTotalKc)}`);
  if (order.discountKc > 0) lines.push(`- Sleva: −${formatKc(order.discountKc)}`);
  lines.push(`- ${order.shippingMethodLabel ?? "Doprava"}: ${order.shippingKc > 0 ? formatKc(order.shippingKc) : "zdarma"}`);
  lines.push(`Celkem: ${formatKc(order.totalKc)}`);
  return lines.join("\n");
}

function detailsTable(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#1A1A1A;">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#404040;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;white-space:pre-wrap;">${escapeHtml(value)}</td></tr>`
    )
    .join("")}</table>`;
}

function layout(ctx: Context, body: string): string {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F7;${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;padding:24px;${FONT}">
${testBanner(ctx)}
<tr><td style="font-size:20px;font-weight:700;letter-spacing:0.5px;color:#000000;padding-bottom:16px;">BEGINA</td></tr>
${body}
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#000000;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a>`;
}

// ---------- zákazník ----------

/** Platební údaje k převodu: text vždy, QR jen když je k dispozici (obrázek vložený přes Content-ID). */
function paymentInstructions(
  order: EmailOrder,
  transfer: TransferInfo | null,
  qrContentId: string | null
): { html: string; text: string } {
  if (order.paymentStatus === "paid") {
    return { html: "", text: "" };
  }
  if (order.paymentMethodCode === "karta") {
    const text = "Platba kartou zatím nebyla dokončena. Zaplatit můžete na stránce objednávky.";
    return { html: `<p style="font-size:14px;margin:0 0 12px;">${text}</p>`, text: `${text}\n\n` };
  }
  if (!transfer) {
    const text = "Platební údaje pro převod vám pošleme co nejdříve. Objednávku vyřídíme po připsání platby.";
    return { html: `<p style="font-size:14px;margin:0 0 12px;">${text}</p>`, text: `${text}\n\n` };
  }
  const lines: [string, string][] = [];
  if (transfer.account) lines.push(["Číslo účtu", transfer.account]);
  if (transfer.iban) lines.push(["IBAN", formatIban(transfer.iban)]);
  lines.push(["Částka", formatKc(transfer.amountKc)]);
  if (transfer.variableSymbol) lines.push(["Variabilní symbol", transfer.variableSymbol]);
  else lines.push(["Zpráva pro příjemce", transfer.message]);
  lines.push(["Splatnost", formatPragueDate(transfer.dueAt)]);
  const after = "Objednávku vyřídíme po připsání platby na účet.";
  const qr =
    qrContentId && transfer.spayd
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;"><tr><td style="padding:8px;border:1px solid #EDEDED;border-radius:8px;background:#FFFFFF;">` +
        `<img src="cid:${qrContentId}" width="180" height="180" alt="QR Platba" style="display:block;width:180px;height:180px;border:0;"></td></tr></table>` +
        `<p style="font-size:13px;color:#404040;margin:0 0 12px;">QR kód naskenujte v aplikaci své banky (QR Platba).</p>`
      : "";
  return {
    html:
      `<p style="font-size:14px;margin:0 0 8px;font-weight:600;">Platba převodem</p>${detailsTable(lines)}${qr}` +
      `<p style="font-size:14px;margin:8px 0 16px;">${after}</p>`,
    text: `Platba převodem\n${lines.map(([l, v]) => `${l}: ${v}`).join("\n")}\n${after}\n\n`,
  };
}

export type CustomerEmailContext = Context & {
  transfer: TransferInfo | null;
  qrContentId: string | null;
  /** číslo faktury v příloze (ostrý provoz, faktura z iDokladu) */
  invoiceNumber?: string | null;
};

/** Věta o přiložené faktuře (PDF posílá MojeBegina, ne iDoklad). */
function invoiceSentence(invoiceNumber: string | null | undefined): string {
  return invoiceNumber ? `V příloze posíláme fakturu č. ${invoiceNumber}.` : "";
}

export function customerOrderEmail(order: EmailOrder, ctx: CustomerEmailContext): RenderedEmail {
  const reference = orderReference(order);
  const paid = order.paymentStatus === "paid";
  const subject = `${subjectPrefix(ctx)}${paid ? `Objednávka ${reference} je zaplacená — děkujeme` : `Přijali jsme vaši objednávku ${reference}`}`;
  const intro =
    (paid
      ? "Děkujeme za objednávku. Begina ji přijala a platbu jsme obdrželi — objednávku připravujeme."
      : "Děkujeme za objednávku. Begina ji přijala a připravíme ji po zaplacení.") +
    (paid && ctx.invoiceNumber ? ` ${invoiceSentence(ctx.invoiceNumber)}` : "");
  const statusUrl = `${ctx.baseUrl}/eshop/objednavka/${order.id}`;
  const details: [string, string][] = [
    ["Objednávka", reference],
    ["Doprava", deliveryText(order)],
    ["Způsob platby", order.paymentMethodLabel ?? "—"],
    ["Stav platby", paymentStateLabel(order)],
  ];
  if (order.customerNote) details.push(["Vaše poznámka", order.customerNote]);
  const instructions = paymentInstructions(order, ctx.transfer, ctx.qrContentId);
  const greeting = order.contactName ? `Dobrý den, ${order.contactName},` : "Dobrý den,";

  const html = layout(
    ctx,
    `<tr><td style="font-size:14px;color:#1A1A1A;">
<p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
${itemsTable(order)}
<div style="height:16px"></div>
${detailsTable(details)}
<div style="height:16px"></div>
${instructions.html}
<p style="margin:0 0 16px;">${button(statusUrl, "Stav objednávky")}</p>
<p style="margin:0;color:#404040;font-size:13px;">S dotazy nám stačí odpovědět na tento e-mail.<br>Begina</p>
</td></tr>`
  );
  const text =
    testBannerText(ctx) +
    `${greeting}\n\n${intro}\n\n${itemsText(order)}\n\n` +
    details.map(([l, v]) => `${l}: ${v}`).join("\n") +
    `\n\n${instructions.text}Stav objednávky: ${statusUrl}\n\nS dotazy nám stačí odpovědět na tento e-mail.\nBegina\n`;
  return { subject, html, text };
}

// ---------- interně pro Beginu ----------

export function internalOrderEmail(order: EmailOrder, ctx: Context & { transfer?: TransferInfo | null }): RenderedEmail {
  const reference = orderReference(order);
  const payment = paymentStateLabel(order);
  const subject = `${subjectPrefix(ctx)}Nová objednávka ${reference} — ${formatKc(order.totalKc)} — ${payment}`;
  const adminUrl = `${ctx.baseUrl}/rizeni-firmy/objednavky/${order.id}`;
  const details: [string, string][] = [
    ["Zákazník", order.contactName ?? "—"],
    ["Částka", formatKc(order.totalKc)],
    ["Doprava", deliveryText(order)],
    ["Platba", `${order.paymentMethodLabel ?? "—"} — ${payment}`],
    ["Poznámka zákazníka", order.customerNote ?? "—"],
  ];
  if (ctx.transfer) {
    details.splice(4, 0, ["Splatnost", formatPragueDate(ctx.transfer.dueAt)]);
    if (ctx.transfer.variableSymbol) details.splice(4, 0, ["Variabilní symbol", ctx.transfer.variableSymbol]);
  }
  const reminder =
    order.paymentStatus !== "paid" && order.paymentMethodCode !== "karta" && !ctx.transfer
      ? "Zákazník čeká na platební údaje k převodu — v potvrzení je neměl (chybí nastavený účet)."
      : "";

  const html = layout(
    ctx,
    `<tr><td style="font-size:14px;color:#1A1A1A;">
<p style="margin:0 0 16px;font-weight:600;">Nová objednávka z e-shopu (${escapeHtml(reference)})</p>
${detailsTable(details)}
<div style="height:16px"></div>
${itemsTable(order)}
<div style="height:16px"></div>
${reminder ? `<p style="margin:0 0 16px;color:#404040;">${escapeHtml(reminder)}</p>` : ""}
<p style="margin:0;">${button(adminUrl, "Otevřít v MojeBegina")}</p>
</td></tr>`
  );
  const text =
    testBannerText(ctx) +
    `Nová objednávka z e-shopu (${reference})\n\n` +
    details.map(([l, v]) => `${l}: ${v}`).join("\n") +
    `\n\n${itemsText(order)}\n\n${reminder ? `${reminder}\n\n` : ""}Detail v MojeBegina: ${adminUrl}\n`;
  return { subject, html, text };
}

// ---------- zákazník: platba přijata (ruční označení v MojeBegina) ----------

export function customerPaymentReceivedEmail(
  order: EmailOrder,
  ctx: Context & { invoiceNumber?: string | null; late?: boolean }
): RenderedEmail {
  const reference = orderReference(order);
  // „late“: faktura vznikla až po potvrzení platby — posílá se zvlášť
  const subject = ctx.late
    ? `${subjectPrefix(ctx)}Faktura k objednávce ${reference}`
    : `${subjectPrefix(ctx)}Platbu za objednávku ${reference} jsme přijali`;
  const intro =
    (ctx.late
      ? "Platbu za vaši objednávku jsme přijali."
      : "Děkujeme, platbu za vaši objednávku jsme přijali. Objednávku připravujeme.") +
    (ctx.invoiceNumber ? ` ${invoiceSentence(ctx.invoiceNumber)}` : "");
  const statusUrl = `${ctx.baseUrl}/eshop/objednavka/${order.id}`;
  const details: [string, string][] = [
    ["Objednávka", reference],
    ["Přijatá částka", formatKc(order.totalKc)],
    ["Doprava", deliveryText(order)],
  ];
  const greeting = order.contactName ? `Dobrý den, ${order.contactName},` : "Dobrý den,";
  const html = layout(
    ctx,
    `<tr><td style="font-size:14px;color:#1A1A1A;">
<p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
${detailsTable(details)}
<div style="height:16px"></div>
${itemsTable(order)}
<div style="height:16px"></div>
<p style="margin:0 0 16px;">${button(statusUrl, "Stav objednávky")}</p>
<p style="margin:0;color:#404040;font-size:13px;">S dotazy nám stačí odpovědět na tento e-mail.<br>Begina</p>
</td></tr>`
  );
  const text =
    testBannerText(ctx) +
    `${greeting}\n\n${intro}\n\n` +
    details.map(([l, v]) => `${l}: ${v}`).join("\n") +
    `\n\n${itemsText(order)}\n\nStav objednávky: ${statusUrl}\n\nS dotazy nám stačí odpovědět na tento e-mail.\nBegina\n`;
  return { subject, html, text };
}

// ---------- zákazník: objednávka zrušena (storno v MojeBegina) ----------

/** Haléře → „379 Kč“ / „379,50 Kč“. */
function formatHalKc(hal: number): string {
  if (hal % 100 === 0) return formatKc(hal / 100);
  return `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hal / 100)} Kč`;
}

/**
 * Potvrzení zrušení. Nezaplacená objednávka: „už nehraďte“. Zaplacená:
 * vrácení se řeší samostatně — e-mail NESLIBUJE automatické vrácení ani
 * termín, jen že se Begina ozve.
 */
export function customerCancellationEmail(order: EmailOrder, ctx: Context & { refundHal: number }): RenderedEmail {
  const reference = orderReference(order);
  const held = ctx.refundHal > 0;
  const subject = `${subjectPrefix(ctx)}Objednávka ${reference} byla zrušena`;
  const intro = `Potvrzujeme, že vaše objednávka ${reference} byla zrušena.`;
  const payment = held
    ? `Platbu ${formatHalKc(ctx.refundHal)} za tuto objednávku jsme přijali. O jejím vrácení se s vámi domluvíme — ozveme se vám.`
    : "Objednávku už prosím nehraďte. Pokud jste platbu mezitím odeslali, odpovězte nám na tento e-mail a domluvíme se.";
  const details: [string, string][] = [
    ["Objednávka", reference],
    ["Stav", "Zrušená"],
    ["Částka objednávky", formatKc(order.totalKc)],
  ];
  const greeting = order.contactName ? `Dobrý den, ${order.contactName},` : "Dobrý den,";
  const html = layout(
    ctx,
    `<tr><td style="font-size:14px;color:#1A1A1A;">
<p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 12px;">${escapeHtml(intro)}</p>
<p style="margin:0 0 16px;font-weight:600;">${escapeHtml(payment)}</p>
${detailsTable(details)}
<div style="height:16px"></div>
${itemsTable(order)}
<div style="height:16px"></div>
<p style="margin:0;color:#404040;font-size:13px;">S dotazy nám stačí odpovědět na tento e-mail.<br>Begina</p>
</td></tr>`
  );
  const text =
    testBannerText(ctx) +
    `${greeting}\n\n${intro}\n\n${payment}\n\n` +
    details.map(([l, v]) => `${l}: ${v}`).join("\n") +
    `\n\n${itemsText(order)}\n\nS dotazy nám stačí odpovědět na tento e-mail.\nBegina\n`;
  return { subject, html, text };
}
