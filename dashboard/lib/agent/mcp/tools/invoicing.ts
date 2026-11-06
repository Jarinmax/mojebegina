// GPT/MCP — fakturace e-shopových objednávek přes asistenta. Žádná druhá
// integrace iDokladu: čtení je společné runIdokladRead (lib/idoklad-read),
// náhled a vystavení volají tutéž datovou vrstvu jako tlačítko „Vystavit
// fakturu v iDokladu“ v detailu objednávky (lib/data/orders.ts → issueInvoice:
// brána ostrého provozu, kontrola iDokladu, řada E-shop Begina 7277293,
// hledání podle VS, zámek, „uhrazeno“). Žádná jiná řada (2026xxxx vede Lucie
// ručně v iDokladu) a žádná faktura bez objednávky v MojeBegina.
//
// Postup asistenta:
//   invoice_preview (jen čtení) → uživatel návrh vidí a výslovně potvrdí →
//   issue_invoice (preview_token, confirm=true, idempotency_key) — jen vystaví,
//   zákazníkovi NIC nepošle; vrací číslo, ID v iDokladu a odkaz na PDF →
//   send_invoice_to_customer jen na výslovnou žádost uživatele (jednou, Bcc).
// Token je podepsaný (HMAC), platí 30 minut a jen pro stejného uživatele,
// stejnou objednávku a PŘESNĚ stejný návrh.
//
// Nástroje vidí a smí volat jen vystavovatelé faktur (invoiceAuth.ts:
// Jaroslav Viner, Lucie Königsbergová) — server je ostatním nevypíše
// a volání odmítne (server.ts, visible). Vystavení a odeslání navíc
// potřebuje samostatný souhlas mojebegina.invoicing (writeScope) —
// obecný mojebegina.write fakturaci neodemyká a naopak.
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import {
  getOrderInvoiceSummary,
  invoicePdfUrl,
  issueOrderInvoiceDetailed,
  previewOrderInvoice,
  sendOrderInvoiceToCustomer,
  type InvoicePreviewLookup,
} from "@/lib/data/orders";
import { INVOICE_ISSUER_NAMES } from "@/lib/data/invoiceAuth";
import { getAppOrigin as appOrigin } from "@/lib/appOrigin";
import { INVOICE_PAID_TEXT } from "@/lib/eshop/invoicing/idoklad";
import { emailConfig, resolveRecipients } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { runIdokladRead } from "@/lib/idoklad-read/tools";
import { allowedExtraRecipients, checkInvoiceRecipients, MAX_INVOICE_RECIPIENTS } from "@/lib/idoklad-read/recipients";
import type { InvoicePdfFile } from "@/lib/idoklad-read/service";
import { idokladAgentTools } from "@/lib/idoklad-read/mcp";
import { ArgError, optionalString, requiredString } from "../args";
import { defineTool, type AgentTool } from "../define";
import { orderUrl } from "./orders";

export const PREVIEW_TOKEN_MINUTES = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PreviewClaims = { userId: string; orderId: string; fingerprint: string; issuedAt: number };

function tokenKey(secret: string): Buffer {
  return createHash("sha256").update(`mojebegina:invoice-preview:${secret}`).digest();
}

function previewSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.MCP_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new Error("MCP_OAUTH_CLIENT_SECRET chybí");
  return secret;
}

export function signPreviewToken(claims: PreviewClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", tokenKey(secret)).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

export function verifyPreviewToken(
  token: string,
  expected: { userId: string; orderId: string },
  secret: string,
  now: number = Date.now()
): { ok: true; claims: PreviewClaims } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "preview_token je neplatný — zobrazte nejdřív náhled faktury (invoice_preview) a použijte token z něj." };
  const [version, body, mac] = token.split(".");
  if (version !== "v1" || !body || !mac) return invalid;
  const good = createHmac("sha256", tokenKey(secret)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return invalid;
  let claims: PreviewClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewClaims;
  } catch {
    return invalid;
  }
  if (claims.userId !== expected.userId) return { ok: false, error: "Náhled faktury zobrazil jiný uživatel — zobrazte ho znovu pod svým účtem." };
  if (claims.orderId !== expected.orderId) return { ok: false, error: "preview_token patří k jiné objednávce." };
  if (!(now - claims.issuedAt >= 0 && now - claims.issuedAt <= PREVIEW_TOKEN_MINUTES * 60_000)) {
    return { ok: false, error: `Náhled faktury je starší než ${PREVIEW_TOKEN_MINUTES} minut — zobrazte ho znovu a nechte ho potvrdit.` };
  }
  return { ok: true, claims };
}

function lookupOf(args: Record<string, unknown>): InvoicePreviewLookup {
  const orderId = optionalString(args, "order_id", 36);
  const orderNumber = optionalString(args, "order_number", 30);
  if ((orderId === null) === (orderNumber === null)) throw new ArgError("Zadejte právě jedno z: order_id, order_number.");
  if (orderId !== null) {
    if (!UUID_RE.test(orderId)) throw new ArgError("Argument order_id musí být id (UUID).");
    return { orderId: orderId.toLowerCase() };
  }
  if (!/^[0-9A-Za-z-]{1,30}$/.test(orderNumber!)) throw new ArgError("Argument order_number musí být číslo objednávky.");
  return { orderNumber: orderNumber! };
}

const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);

const IDOKLAD_TOOLS: AgentTool[] = idokladAgentTools(defineTool, () => "mcp:chatgpt").map((tool) => ({ ...tool, visible: issuerOnly }));

const PAYMENT_METHOD_LABELS: Record<string, string> = { card: "kartou", bank_transfer: "převodem", cash: "hotově" };

const ISSUE_TOOLS: AgentTool[] = [
  defineTool({
    name: "invoice_preview",
    title: "Náhled faktury k objednávce",
    description:
      "JEN ČTENÍ — nic nevystaví ani neodešle. Sestaví návrh faktury k e-shopové (nebo z WooCommerce importované) objednávce přesně tak, jak by ji vystavilo MojeBegina " +
      "do iDokladu (řada E-shop Begina): odběratel, položky, doprava, celkem, VS, data, úhrada (způsob, den) a text o zaplacení na faktuře; dále blokující problémy, " +
      "zda je objednávka skutečně zaplacená, dosavadní stav faktury (vystavená? PDF? odesláno?) a komu by PDF případně odešlo. Celý náhled ukaž uživateli. " +
      "Když canIssue=true, vrací preview_token pro issue_invoice (platí 30 minut, jen pro tebe a jen pro tento návrh).",
    write: false,
    visible: issuerOnly,
    properties: {
      order_id: { type: "string", description: "id objednávky (UUID)." },
      order_number: { type: "string", description: "Číslo objednávky v MojeBegina nebo číslo objednávky z WooCommerce (místo order_id)." },
    },
    required: [],
    parse: lookupOf,
    execute: async (lookup) => {
      const ctx = await getAuthContext();
      const result = await previewOrderInvoice(lookup);
      if (!result.ok || !ctx) return result.ok ? { ok: false, error: "Nepřihlášený uživatel." } : result;
      const p = result.preview;
      const issued = p.existing?.docState === "issued";
      const reasons = [
        ...(!p.mode.live ? [p.mode.reason] : []),
        ...(p.orderStatus.notPaidReason ? [p.orderStatus.notPaidReason] : []),
        ...(p.existing?.unclear ? [p.existing.unclear] : []),
        ...(issued ? [`Faktura ${p.existing!.invoiceNumber ?? ""} už je vystavená — znovu se nevystavuje.`] : p.blocking.map((b) => b.message)),
      ];
      const canIssue = reasons.length === 0;
      const method = p.draft.paymentMethod;
      return {
        ok: true,
        summary: { canIssue, blocking: p.blocking.length, alreadyIssued: issued },
        data: {
          ...p,
          payment: {
            paid: p.orderStatus.paidForInvoice,
            method,
            methodLabel: method ? (PAYMENT_METHOD_LABELS[method] ?? method) : null,
            paidDate: p.draft.paidDate,
            // faktura vzniká až po úplné úhradě — v iDokladu se hned označí jako uhrazená
            invoiceMarkedPaid: true,
            invoiceText: INVOICE_PAID_TEXT,
            note:
              method === "card"
                ? "Zaplaceno kartou — na převod se nečeká; faktura se vystaví rovnou jako uhrazená."
                : p.orderStatus.paidForInvoice
                  ? "Úhrada je v MojeBegina zapsaná — faktura se vystaví jako uhrazená."
                  : "Úhrada v MojeBegina není zapsaná celá — fakturu zatím nejde vystavit.",
          },
          ...(issued ? { pdfUrl: await invoicePdfUrl(p.orderId) } : {}),
          canIssue,
          cannotIssueReasons: reasons,
          sendsEmail: false,
          ...(canIssue
            ? {
                preview_token: signPreviewToken(
                  { userId: ctx.userId, orderId: p.orderId, fingerprint: p.fingerprint, issuedAt: Date.now() },
                  previewSecret()
                ),
                previewValidMinutes: PREVIEW_TOKEN_MINUTES,
                nextStep:
                  "Ukaž uživateli celý náhled (odběratel, položky, celkem, úhrada a text „uhrazeno“) a zeptej se, zda fakturu vystavit. Až po jeho výslovném souhlasu zavolej issue_invoice s tímto preview_token, confirm=true a novým idempotency_key. Vystavení zákazníkovi NIC neposílá — poslat jen na výslovnou žádost uživatele (send_invoice_to_customer).",
              }
            : {}),
        },
      };
    },
  }),
  defineTool({
    name: "issue_invoice",
    title: "Vystavit fakturu v iDokladu (bez odeslání)",
    description:
      "ZÁPIS DO ÚČETNICTVÍ — vystaví fakturu k objednávce v iDokladu (řada E-shop Begina) a označí ji jako uhrazenou. Zákazníkovi NIC neposílá. " +
      "Volej JEN poté, co jsi uživateli ukázal invoice_preview a on výslovně potvrdil vystavení. Vyžaduje preview_token z náhledu, confirm=true a idempotency_key. " +
      "Když se údaje objednávky od náhledu změnily nebo je stav nejasný, nic nevystaví a vrátí důvod — sděl ho uživateli a nic neobcházej. " +
      "Vrací číslo faktury, ID v iDokladu, odkaz na objednávku a na PDF v MojeBegina. Už vystavenou fakturu znovu nevystaví.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      order_id: { type: "string", description: "id objednávky (UUID) — orderId z náhledu." },
      preview_token: { type: "string", description: "preview_token z invoice_preview." },
      confirm: { type: "boolean", description: "true = uživatel výslovně potvrdil vystavení této faktury." },
    },
    required: ["order_id", "preview_token", "confirm"],
    parse: (args) => {
      const lookup = lookupOf({ order_id: args.order_id });
      if (args.confirm !== true) throw new ArgError("Fakturu lze vystavit jen s confirm=true po výslovném souhlasu uživatele s náhledem.");
      return { orderId: (lookup as { orderId: string }).orderId, token: requiredString(args, "preview_token", 2000) };
    },
    execute: async ({ orderId, token }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `Fakturu do iDokladu smí vystavit jen ${INVOICE_ISSUER_NAMES}.` };
      const verified = verifyPreviewToken(token, { userId: ctx.userId, orderId }, previewSecret());
      if (!verified.ok) return verified;
      const result = await issueOrderInvoiceDetailed(orderId, { expectedFingerprint: verified.claims.fingerprint, send: false });
      if (!result.ok) return result;
      const invoice = await getOrderInvoiceSummary(orderId);
      return {
        ok: true,
        summary: { issued: result.status === "issued", emailed: false },
        data: {
          orderId,
          status: result.status,
          invoiceNumber: result.invoiceNumber,
          idokladId: invoice?.externalId ?? null,
          numberSeries: invoice?.numberSeries ?? null,
          markedPaid: true,
          emailed: false,
          pdfSentToCustomer: invoice?.pdfSentAt ?? null,
          orderUrl: orderUrl(await appOrigin(), orderId),
          pdfUrl: await invoicePdfUrl(orderId),
          message: `${result.message} Zákazníkovi se nic neposlalo — poslat jen na výslovnou žádost (send_invoice_to_customer).`,
        },
      };
    },
  }),
  defineTool({
    name: "send_invoice_to_customer",
    title: "Poslat vystavenou fakturu zákazníkovi",
    description:
      "ZÁPIS — pošle zákazníkovi e-mailem PDF UŽ VYSTAVENÉ faktury (se skrytou kopií Begině), nejvýš jednou. Volej JEN když uživatel výslovně požádal o odeslání " +
      "konkrétní faktury zákazníkovi — nikdy automaticky po vystavení. Vyžaduje confirm=true a idempotency_key. Už odeslanou fakturu znovu neposílá; fakturu nevystavuje.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      order_id: { type: "string", description: "id objednávky (UUID)." },
      confirm: { type: "boolean", description: "true = uživatel výslovně požádal o odeslání této faktury zákazníkovi." },
    },
    required: ["order_id", "confirm"],
    parse: (args) => {
      const lookup = lookupOf({ order_id: args.order_id });
      if (args.confirm !== true) throw new ArgError("Fakturu lze poslat jen s confirm=true na výslovnou žádost uživatele.");
      return { orderId: (lookup as { orderId: string }).orderId };
    },
    execute: async ({ orderId }) => {
      const result = await sendOrderInvoiceToCustomer(orderId);
      if (!result.ok) return result;
      return {
        ok: true,
        summary: { emailed: result.emailed },
        data: { orderId, ...result, pdfUrl: await invoicePdfUrl(orderId) },
      };
    },
  }),
];

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * PDF libovolné vydané faktury z iDokladu (i ruční řady 2026xxxx) e-mailem
 * ze serveru MojeBegina (Resend, odesílatel e-shopu). Jen na výslovnou žádost,
 * jen povoleným příjemcům (lib/idoklad-read/recipients.ts) a se samostatným
 * souhlasem mojebegina.invoicing. PDF se čte přes společný runner čtení
 * iDokladu (audit idoklad_read_log), výsledek s příjemci zůstane v agent_audit_log.
 */
const SEND_IDOKLAD_TOOLS: AgentTool[] = [
  defineTool({
    name: "send_idoklad_invoice_email",
    title: "Poslat PDF faktury z iDokladu e-mailem",
    description:
      "ZÁPIS — pošle e-mailem PDF EXISTUJÍCÍ vydané faktury z iDokladu (i z ruční řady 2026xxxx) z MojeBegina. Nic nevystavuje ani nemění. " +
      "Volej JEN když uživatel výslovně požádal o odeslání konkrétní faktury konkrétním příjemcům. Povolení příjemci: e-mail odběratele uvedený na faktuře, " +
      `adresy @begina.cz, e-mail účtu uživatele v MojeBegina a adresy povolené správcem; jiné server odmítne. Nejvýš ${MAX_INVOICE_RECIPIENTS} příjemců. ` +
      "Vyžaduje confirm=true a idempotency_key.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      number: { type: "string", description: "Číslo faktury, např. „20260202“." },
      id: { type: "integer", description: "ID faktury v iDokladu (když číslo není jednoznačné)." },
      to: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_INVOICE_RECIPIENTS, description: "Příjemci (e-maily)." },
      message: { type: "string", description: "Krátký průvodní text (nepovinné, max. 1000 znaků)." },
      confirm: { type: "boolean", description: "true = uživatel výslovně požádal o odeslání této faktury těmto příjemcům." },
    },
    required: ["to", "confirm"],
    parse: (args) => {
      const number = optionalString(args, "number", 20);
      const id = args.id === undefined || args.id === null ? null : Number(args.id);
      if (id !== null && !(Number.isInteger(id) && id > 0)) throw new ArgError("Argument id musí být kladné celé číslo.");
      if (!number && id === null) throw new ArgError("Zadejte number nebo id faktury.");
      if (!Array.isArray(args.to) || args.to.some((e) => typeof e !== "string")) throw new ArgError("Argument to musí být seznam e-mailů.");
      if (args.confirm !== true) throw new ArgError("Fakturu lze poslat jen s confirm=true na výslovnou žádost uživatele.");
      return { number, id, to: args.to as string[], message: optionalString(args, "message", 1000) };
    },
    execute: async ({ number, id, to, message }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `Faktury z iDokladu smí posílat jen ${INVOICE_ISSUER_NAMES}.` };
      const config = emailConfig();
      if (!config) return { ok: false, error: "Odesílání e-mailů z MojeBegina není na tomto prostředí zapnuté." };
      const read = await runIdokladRead("idoklad_invoice_pdf_file", { ...(number ? { number } : {}), ...(id ? { id } : {}) }, "mcp:chatgpt");
      if (!read.ok) return { ok: false, error: read.error };
      if (read.data.found !== true) return { ok: false, error: `Faktura ${number ?? id} v iDokladu není.` };
      const pdf = read.data as unknown as InvoicePdfFile;
      const check = checkInvoiceRecipients(to, { partnerEmail: pdf.partnerEmail, userEmail: ctx.email || null, extra: allowedExtraRecipients() });
      if (!check.ok) return check;

      const resolved = resolveRecipients(check.to, config);
      const test = config.testRecipients !== null;
      const invoiceNumber = pdf.invoice.number;
      const intro = message?.trim() || "Dobrý den,";
      const body = `V příloze posíláme fakturu č. ${invoiceNumber}.`;
      const testNote = test && resolved.withheld.length ? `\n\n[TEST] Určeno pro: ${resolved.withheld.join(", ")}` : "";
      const text = `${intro}\n\n${body}\n\nS pozdravem\nBegina${testNote}`;
      const html = `<p>${escapeHtml(intro).replace(/\n/g, "<br>")}</p><p>${escapeHtml(body)}</p><p>S pozdravem<br>Begina</p>${testNote ? `<p><small>${escapeHtml(testNote.trim())}</small></p>` : ""}`;
      const key = createHash("sha256").update(`${pdf.invoice.id}|${[...check.to].sort().join(",")}`).digest("hex").slice(0, 32);
      const sent = await resendTransport(config.apiKey)(
        {
          from: config.from,
          to: resolved.to,
          replyTo: config.replyTo,
          subject: `${test ? "[TEST] " : ""}Faktura ${invoiceNumber} – Begina`,
          text,
          html,
          attachments: [{ filename: pdf.filename, contentBase64: pdf.contentBase64, contentType: "application/pdf" }],
        },
        `idoklad-invoice-${key}`
      );
      if (!sent.ok) return { ok: false, error: `E-mail se nepodařilo odeslat: ${sent.error}` };
      return {
        ok: true,
        summary: { sent: true, recipients: resolved.to.length },
        data: {
          sent: true,
          invoiceNumber,
          idokladId: pdf.invoice.id,
          to: resolved.to,
          withheldInTestMode: resolved.withheld,
          recipientKinds: check.reasons,
          messageId: sent.id,
          message: `PDF faktury ${invoiceNumber} je odeslané na ${resolved.to.join(", ")}.`,
        },
      };
    },
  }),
];

export const INVOICING_TOOLS: AgentTool[] = [...IDOKLAD_TOOLS, ...ISSUE_TOOLS, ...SEND_IDOKLAD_TOOLS];
