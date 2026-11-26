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
import { invoiceEmailParagraphs, invoiceGreeting } from "@/lib/eshop/invoicing/invoiceEmailText";
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { invoiceIssuerEmails } from "@/lib/data/invoiceIssuerEmails";
import {
  getOrderInvoiceSummary,
  invoicePdfUrl,
  issueOrderInvoiceDetailed,
  linkOrderExternalInvoice,
  previewOrderInvoice,
  sendOrderInvoiceToCustomer,
  type InvoicePreviewLookup,
} from "@/lib/data/orders";
import { INVOICE_ISSUER_NAMES } from "@/lib/data/invoiceAuth";
import { getAppOrigin as appOrigin } from "@/lib/appOrigin";
import { INVOICE_PAID_TEXT } from "@/lib/eshop/invoicing/idoklad";
import { emailConfig, resolveRecipients, invoiceCopyRecipients, invoiceEmailSender } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { db } from "@/lib/db/client";
import { orderIdsForInvoiceNumber, recordInvoiceEmailed } from "@/lib/eshop/invoiceSentFlag";
import { fetchFioTransactions } from "@/lib/eshop/fio";
import { linkFioPayments } from "@/lib/eshop/fioLinks";
import { PARTNER_EMAIL_SIGNATURE } from "@/lib/eshop/partnerMonthly";
import { loadPartnerOptOuts } from "@/lib/eshop/partnerMonthlyServer";
import { PARTNER_INTRO_TEXT } from "@/lib/eshop/email/templates";
import { eshopAbsoluteUrl } from "@/lib/eshop/paths";
import { sql } from "drizzle-orm";
import { runIdokladRead } from "@/lib/idoklad-read/tools";
import { allowedExtraRecipients, checkInvoiceRecipients, MAX_INVOICE_RECIPIENTS } from "@/lib/idoklad-read/recipients";
import type { InvoicePdfFile } from "@/lib/idoklad-read/service";
import { createB2bInvoice, previewB2bInvoice } from "@/lib/data/b2bInvoices";
import { correctInvoice, previewInvoiceCorrection } from "@/lib/data/invoiceCorrections";
import { applyOwnInvoiceChange, isOwnInvoiceNumber, previewOwnInvoiceChange } from "@/lib/data/ownInvoiceChanges";
import { OWN_PAYMENT_METHODS, type OwnChangeInput, type OwnChangeMethod, type OwnChangePreview } from "@/lib/eshop/invoicing/ownChange";
import { loadOwnDocument, markOwnDocumentSent, ownDocumentPdf } from "@/lib/eshop/invoicing/ownIssue";
import { ownInvoicePdfPath } from "@/lib/eshop/invoicing/ownB2b";
import { CORRECTION_PAYMENT_METHODS, type CorrectionPaymentMethod, type InvoiceCorrectionInput } from "@/lib/eshop/invoicing/invoiceCorrection";
import { B2B_PAYMENT_METHODS, MAX_B2B_ITEMS, type B2bInvoiceRaw } from "@/lib/eshop/invoicing/b2bInvoiceValidation";
import { idokladInvoicePdfPath } from "@/lib/idoklad-read/tools";
import { idokladAgentTools } from "@/lib/idoklad-read/mcp";
import { ArgError, optionalString, requiredString } from "../args";
import { defineTool, type AgentTool } from "../define";
import { orderUrl } from "./orders";

/**
 * Nový zákazník (Lucie 15. 11. / Jarin 19. 11. 2026): novým zákazníkům se
 * k první faktuře vždy přidá představení partnerského programu — i u faktur
 * mimo e-shop (B2B, prodej na ochutnávce). Nový = odběratel nemá v iDokladu
 * jinou fakturu (podle IČO) a e-mail zákazníka nemá v MojeBegina víc než
 * jednu nezrušenou objednávku; kdo odmítl obchodní sdělení, nic nedostane.
 */
async function isNewInvoiceCustomer(invoice: { id: number; partner: { ico: string | null } }, customerEmails: string[]): Promise<boolean> {
  try {
    if (customerEmails.length === 0) return false;
    const optOuts = await loadPartnerOptOuts(db);
    if (customerEmails.some((e) => optOuts.includes(e))) return false;
    const ico = invoice.partner.ico;
    if (ico) {
      const read = await runIdokladRead("idoklad_search_invoices", { ico, limit: 5 }, "mcp:chatgpt");
      if (!read.ok) return false;
      const others = ((read.data.invoices ?? []) as { id: number }[]).filter((i) => i.id !== invoice.id);
      if (others.length > 0) return false;
    }
    const rows = (await db.execute(sql`
      SELECT count(*)::int AS n FROM orders
       WHERE fulfillment_status <> 'cancelled' AND lower(btrim(contact_email)) IN (${sql.join(customerEmails.map((e) => sql`${e}`), sql`, `)})`)).rows as { n: number }[];
    return (rows[0]?.n ?? 0) <= 1;
  } catch (error) {
    console.error("Faktura: nepodařilo se ověřit nového zákazníka", error instanceof Error ? error.message.slice(0, 200) : error);
    return false;
  }
}

/** Nový zákazník u vlastní faktury: žádná jiná vlastní faktura na IČO a nejvýš jedna objednávka. */
async function isNewOwnCustomer(ico: string | null, customerEmails: string[]): Promise<boolean> {
  try {
    if (customerEmails.length === 0) return false;
    const optOuts = await loadPartnerOptOuts(db);
    if (customerEmails.some((e) => optOuts.includes(e))) return false;
    if (ico) {
      const docs = (await db.execute(sql`SELECT count(*)::int AS n FROM own_invoice_documents WHERE customer_ico = ${ico} AND state <> 'cancelled'`)).rows as { n: number }[];
      if ((docs[0]?.n ?? 0) > 1) return false;
    }
    const rows = (await db.execute(sql`
      SELECT count(*)::int AS n FROM orders
       WHERE fulfillment_status <> 'cancelled' AND lower(btrim(contact_email)) IN (${sql.join(customerEmails.map((e) => sql`${e}`), sql`, `)})`)).rows as { n: number }[];
    return (rows[0]?.n ?? 0) <= 1;
  } catch {
    return false;
  }
}

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
  defineTool({
    name: "link_order_invoice",
    title: "Propojit objednávku s už vystavenou fakturou",
    description:
      "ZÁPIS — propojí objednávku v MojeBegina s fakturou, která už v iDokladu existuje (např. ruční faktura 2026xxxx vystavená k objednávce z e-shopu), " +
      "aby k objednávce nevznikla druhá faktura. Stejná akce jako „Propojit s touto fakturou“ v detailu objednávky: číslo se ověří v iDokladu. " +
      "Nic nevystavuje ani neposílá. Volej jen po souhlasu uživatele, s confirm=true a idempotency_key.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      order_id: { type: "string", description: "id objednávky (UUID)." },
      invoice_number: { type: "string", description: "Číslo už vystavené faktury v iDokladu, např. 20260213." },
      confirm: { type: "boolean", description: "true = uživatel s propojením souhlasí." },
    },
    required: ["order_id", "invoice_number", "confirm"],
    parse: (args) => {
      const lookup = lookupOf({ order_id: args.order_id });
      if (args.confirm !== true) throw new ArgError("Propojit lze jen s confirm=true po souhlasu uživatele.");
      const invoiceNumber = requiredString(args, "invoice_number", 20);
      if (!/^[0-9A-Za-z/-]{1,20}$/.test(invoiceNumber)) throw new ArgError("Číslo faktury není platné.");
      return { orderId: (lookup as { orderId: string }).orderId, invoiceNumber };
    },
    execute: async ({ orderId, invoiceNumber }) => {
      const result = await linkOrderExternalInvoice(orderId, invoiceNumber);
      if (!result.ok) return result;
      return { ok: true, summary: { linked: true }, data: { orderId, invoiceNumber, message: result.message, url: orderUrl(await appOrigin(), orderId) } };
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
    title: "Poslat PDF faktury e-mailem",
    description:
      "ZÁPIS — pošle e-mailem PDF EXISTUJÍCÍ vydané faktury podle čísla: vlastní faktury MojeBegina (řada 2026xxxx od 20260215) i starší z iDokladu. Nic nevystavuje ani nemění (jen u vlastní faktury zapíše, že byla odeslána odběrateli). Stornovanou neposílá. " +
      "Volej JEN když uživatel výslovně požádal o odeslání konkrétní faktury konkrétním příjemcům. Povolení příjemci: e-mail odběratele uvedený na faktuře, " +
      `adresy @begina.cz, e-mail účtu uživatele v MojeBegina, e-maily vystavovatelů faktur (${INVOICE_ISSUER_NAMES}) a adresy povolené správcem; jiné server odmítne. ` +
      "Když uživatel řekne „pošli mi to / na můj e-mail“, nastav to_me=true — server doplní e-mail jeho účtu v MojeBegina; adresu NEHÁDEJ ani ji neber z účtu ChatGPT. " +
      `E-mail odchází z info@begina.cz a info@begina.cz dostane vždy skrytou kopii — do příjemců ho dávat nemusíš. Nejvýš ${MAX_INVOICE_RECIPIENTS} příjemců. ` +
      "Vyžaduje confirm=true a idempotency_key.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      number: { type: "string", description: "Číslo faktury, např. „20260202“." },
      id: { type: "integer", description: "ID faktury v iDokladu (když číslo není jednoznačné)." },
      to: { type: "array", items: { type: "string" }, maxItems: MAX_INVOICE_RECIPIENTS, description: "Příjemci (e-maily), které uživatel výslovně uvedl. Nepovinné, když to_me=true." },
      to_me: { type: "boolean", description: "true = poslat i na e-mail účtu přihlášeného uživatele v MojeBegina („pošli mi to“)." },
      message: { type: "string", description: "Krátký průvodní text (nepovinné, max. 1000 znaků)." },
      confirm: { type: "boolean", description: "true = uživatel výslovně požádal o odeslání této faktury těmto příjemcům." },
    },
    required: ["confirm"],
    parse: (args) => {
      const number = optionalString(args, "number", 20);
      const id = args.id === undefined || args.id === null ? null : Number(args.id);
      if (id !== null && !(Number.isInteger(id) && id > 0)) throw new ArgError("Argument id musí být kladné celé číslo.");
      if (!number && id === null) throw new ArgError("Zadejte number nebo id faktury.");
      const to = args.to === undefined || args.to === null ? [] : args.to;
      if (!Array.isArray(to) || to.some((e) => typeof e !== "string")) throw new ArgError("Argument to musí být seznam e-mailů.");
      if (args.to_me !== undefined && typeof args.to_me !== "boolean") throw new ArgError("Argument to_me musí být true/false.");
      const toMe = args.to_me === true;
      if (to.length === 0 && !toMe) throw new ArgError("Zadejte příjemce (to), nebo to_me=true pro e-mail účtu uživatele.");
      if (args.confirm !== true) throw new ArgError("Fakturu lze poslat jen s confirm=true na výslovnou žádost uživatele.");
      return { number, id, to: to as string[], toMe, message: optionalString(args, "message", 1000) };
    },
    execute: async ({ number, id, to: requested, toMe, message }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `Faktury smí posílat jen ${INVOICE_ISSUER_NAMES}.` };
      const own = ctx.email?.trim() || null;
      if (toMe && !own) return { ok: false, error: "Váš účet v MojeBegina nemá e-mail — řekněte, na jakou adresu fakturu poslat. Nic se neodeslalo." };
      const to = toMe && own ? [own, ...requested] : requested;
      const config = emailConfig();
      if (!config) return { ok: false, error: "Odesílání e-mailů z MojeBegina není na tomto prostředí zapnuté." };
      // Vlastní faktura MojeBegina (řada 2026xxxx od 23. 11. 2026) má přednost; jinak archiv iDokladu.
      const ownDoc = number && /^\d{8}$/.test(number) ? await loadOwnDocument(db, number) : null;
      let pdf: InvoicePdfFile;
      if (ownDoc) {
        if (ownDoc.state === "cancelled") return { ok: false, error: `Faktura ${number} je stornovaná — neposílá se.` };
        const file = await ownDocumentPdf(db, ownDoc.id);
        if (!file) return { ok: false, error: `Faktura ${number} v MojeBegina není.` };
        pdf = {
          invoice: { id: 0, number: ownDoc.number, partner: { ico: ownDoc.snapshot.customer.ico } } as unknown as InvoicePdfFile["invoice"],
          partnerEmail: ownDoc.snapshot.customer.email,
          filename: file.filename,
          contentBase64: file.contentBase64,
          sizeBytes: Math.round((file.contentBase64.length * 3) / 4),
        };
      } else {
        const read = await runIdokladRead("idoklad_invoice_pdf_file", { ...(number ? { number } : {}), ...(id ? { id } : {}) }, "mcp:chatgpt");
        if (!read.ok) return { ok: false, error: read.error };
        if (read.data.found !== true) return { ok: false, error: `Faktura ${number ?? id} není v MojeBegina ani v iDokladu.` };
        pdf = read.data as unknown as InvoicePdfFile;
      }
      const check = checkInvoiceRecipients(to, { partnerEmail: pdf.partnerEmail, userEmail: own, teamEmails: await invoiceIssuerEmails(), extra: allowedExtraRecipients() });
      if (!check.ok) return check;

      const resolved = resolveRecipients(check.to, config);
      const customerTo = check.to.filter((e) => check.reasons[e] === "customer");
      const partnerIntro = ownDoc ? await isNewOwnCustomer(ownDoc.snapshot.customer.ico, customerTo) : await isNewInvoiceCustomer(pdf.invoice, customerTo);
      const partnerUrl = eshopAbsoluteUrl(await appOrigin(), "/partnersky-program");
      const partnerText = partnerIntro ? `${PARTNER_INTRO_TEXT} ${partnerUrl}` : "";
      const test = config.testRecipients !== null;
      const invoiceNumber = pdf.invoice.number;
      // Lucie 26. 11. 2026: nikdy holé „Dobrý den,“ — vždy „Dobrý den, pane Kašpárku,“ a profesionální text.
      const custom = message?.trim() || "";
      const greeting = invoiceGreeting(ownDoc?.snapshot.customer.name ?? null);
      if (!custom && !greeting && customerTo.length > 0) {
        return { ok: false, error: "Z odběratele nejde odvodit oslovení. Pošlete znovu s message, která začíná oslovením, např. „Dobrý den, pane Kašpárku,“. Nic se neodeslalo." };
      }
      const intro = custom || greeting || "Dobrý den,";
      // Vlastní průvodní text, který už číslo faktury zmiňuje, se neopakuje — jinak standardní odstavce.
      const body = intro.includes(invoiceNumber)
        ? ""
        : invoiceEmailParagraphs({
            number: invoiceNumber,
            totalKc: ownDoc?.snapshot.totalKc ?? null,
            dueDate: ownDoc?.snapshot.dueDate ?? null,
            paid: ownDoc ? Boolean(ownDoc.snapshot.paidDate) : false,
          }).join("\n\n");
      const testNote = test && resolved.withheld.length ? `\n\n[TEST] Určeno pro: ${resolved.withheld.join(", ")}` : "";
      // Podpis jako v poště info@begina.cz (Lucie 15. 11. 2026).
      const [team, ...contacts] = PARTNER_EMAIL_SIGNATURE;
      const text = `${intro}\n\n${body ? `${body}\n\n` : ""}${partnerText ? `${partnerText}\n\n` : ""}S přátelským pozdravem\n${PARTNER_EMAIL_SIGNATURE.join("\n")}${testNote}`;
      const paragraphs = intro.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
      const html = `${paragraphs}${body ? body.split("\n\n").map((p) => `<p>${escapeHtml(p)}</p>`).join("") : ""}${partnerIntro ? `<p>${escapeHtml(PARTNER_INTRO_TEXT)} <a href="${escapeHtml(partnerUrl)}">${escapeHtml(partnerUrl)}</a></p>` : ""}<p><em>S přátelským pozdravem</em><br><strong>${escapeHtml(team)}</strong><br>${contacts.map(escapeHtml).join("<br>")}</p>${testNote ? `<p><small>${escapeHtml(testNote.trim())}</small></p>` : ""}`;
      const key = createHash("sha256").update(`${ownDoc ? `own-${ownDoc.id}-v${ownDoc.version}` : pdf.invoice.id}|${[...check.to].sort().join(",")}`).digest("hex").slice(0, 32);
      // odesílatel info@begina.cz, skrytá kopie Begině (info@begina.cz)
      const sender = invoiceEmailSender(config);
      const bcc = invoiceCopyRecipients(config, resolved.to);
      const sent = await resendTransport(config.apiKey)(
        {
          from: sender.from,
          to: resolved.to,
          ...(bcc.length ? { bcc } : {}),
          replyTo: sender.replyTo,
          subject: `${test ? "[TEST] " : ""}Faktura č. ${invoiceNumber} – Begina`,
          text,
          html,
          attachments: [{ filename: pdf.filename, contentBase64: pdf.contentBase64, contentType: "application/pdf" }],
        },
        `idoklad-invoice-${key}`
      );
      if (!sent.ok) return { ok: false, error: `E-mail se nepodařilo odeslat: ${sent.error}` };
      // „Faktura poslána“ u objednávky v MojeBegina, ke které faktura patří —
      // jen když odešla zákazníkovi (odběrateli z faktury), ne interně nebo v testu
      const partner = pdf.partnerEmail?.trim().toLowerCase() || null;
      if (!test && partner && resolved.to.some((e) => e.trim().toLowerCase() === partner)) {
        if (ownDoc) await markOwnDocumentSent(db, ownDoc.id);
        await recordInvoiceEmailed(db, await orderIdsForInvoiceNumber(db, invoiceNumber), resolved.to, {
          userId: ctx.userId,
          name: `${ctx.name ?? ctx.email} (přes ChatGPT)`,
        });
      }
      return {
        ok: true,
        summary: { sent: true, recipients: resolved.to.length },
        data: {
          sent: true,
          invoiceNumber,
          idokladId: ownDoc ? null : pdf.invoice.id,
          to: resolved.to,
          bcc,
          from: sender.from,
          withheldInTestMode: resolved.withheld,
          recipientKinds: check.reasons,
          partnerProgramIntro: partnerIntro,
          messageId: sent.id,
          message: `PDF faktury ${invoiceNumber} je odeslané z ${sender.from} na ${resolved.to.join(", ")}${bcc.length ? ` (skrytá kopie ${bcc.join(", ")})` : ""}.`,
        },
      };
    },
  }),
];

// ------------------------------------------------------------------ B2B faktury (řada Lucie)

const B2B_PROPERTIES: Record<string, unknown> = {
  customer_ico: { type: "string", description: "IČO odběratele (8 číslic). Odběratel se vezme z karty zákazníka v MojeBegina (fakturační jméno, sídlo, DIČ, e-mail)." },
  items: {
    type: "array",
    minItems: 1,
    maxItems: MAX_B2B_ITEMS,
    description: "Položky faktury.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Název položky." },
        quantity: { type: "number", description: "Množství (kladné, nejvýš na 2 desetinná místa)." },
        unit: { type: "string", description: "Jednotka (výchozí ks)." },
        unit_price_kc: { type: "number", description: "Jednotková cena v Kč (Begina je neplátce DPH). Záporná smí být jen u řádku slevy pojmenovaného „Sleva“ (např. Sleva, −24)." },
      },
      required: ["name", "quantity", "unit_price_kc"],
      additionalProperties: false,
    },
  },
  payment_method: { type: "string", enum: [...B2B_PAYMENT_METHODS], description: "Způsob úhrady: bank_transfer (převodem, výchozí), cash (hotově), card (kartou)." },
  paid: { type: "boolean", description: "true = faktura je už zaplacená (označí se jako uhrazená); false/vynechat = otevřená, neuhrazená." },
  issue_date: { type: "string", description: "Datum vystavení RRRR-MM-DD (výchozí dnes, nejvýš 15 dní zpět)." },
  due_days: { type: "integer", minimum: 0, maximum: 90, description: "Splatnost v kalendářních dnech od vystavení — zadávej JEN když uživatel výslovně chce jinou; výchozí jsou 3 pracovní dny (nikdy 14)." },
  due_date: { type: "string", description: "Datum splatnosti RRRR-MM-DD (místo due_days)." },
  note: { type: "string", description: "Text za položkami na faktuře (max. 500 znaků), přesně jak ho uživatel chce." },
  order_number: { type: "string", description: "Číslo objednávky odběratele (nepovinné)." },
  description: { type: "string", description: "Popis faktury (nepovinné)." },
  expected_total_kc: { type: "number", description: "Kontrolní celková částka z podkladu — když nesedí s položkami, nic se nevystaví." },
};
const B2B_KEYS = Object.keys(B2B_PROPERTIES);

function b2bRawOf(args: Record<string, unknown>, extra: string[]): B2bInvoiceRaw {
  const unknown = Object.keys(args).filter((k) => !B2B_KEYS.includes(k) && !extra.includes(k));
  if (unknown.length) throw new ArgError(`Neznámé argumenty: ${unknown.join(", ")}.`);
  const items = Array.isArray(args.items)
    ? args.items.map((raw) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        return { name: item.name, quantity: item.quantity, unit: item.unit, unitPriceKc: item.unit_price_kc };
      })
    : args.items;
  return {
    ico: args.customer_ico,
    items,
    paymentMethod: args.payment_method,
    paid: args.paid,
    issueDate: args.issue_date,
    dueDays: args.due_days,
    dueDate: args.due_date,
    note: args.note,
    orderNumber: args.order_number,
    description: args.description,
    expectedTotalKc: args.expected_total_kc,
  };
}

/**
 * Pojistka proti míchání řad (Lucie 19. 11. 2026): objednávka z e-shopu
 * se fakturuje JEN v řadě E-shop Begina (invoice_preview / issue_invoice),
 * nikdy ruční B2B fakturou v řadě 2026xxxx — jinak MojeBegina o faktuře
 * neví a hrozí druhá faktura. Vrací důvod zablokování, nebo null.
 */
async function eshopOrderBlockingB2b(ico: unknown, totalKc: number, orderNumberRaw: unknown): Promise<string | null> {
  const orderNumber = typeof orderNumberRaw === "string" ? orderNumberRaw.trim() : "";
  if (/^\d{8}$/.test(orderNumber)) {
    const rows = await db.execute<{ order_number: number; channel: string }>(sql`
      SELECT order_number, channel FROM orders WHERE order_number = ${Number(orderNumber)} LIMIT 1`);
    const row = rows.rows[0];
    if (row && row.channel === "eshop") {
      return `Objednávka ${row.order_number} je z e-shopu — fakturu k ní vystav přes invoice_preview → issue_invoice, ne ruční fakturou bez objednávky.`;
    }
  }
  const icoStr = typeof ico === "string" ? ico.replace(/\s+/g, "") : "";
  if (!/^\d{8}$/.test(icoStr)) return null;
  const rows = await db.execute<{ order_number: number }>(sql`
    SELECT o.order_number FROM orders o
    LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    WHERE o.channel = 'eshop'
      AND o.fulfillment_status <> 'cancelled'
      AND (o.billing_ico = ${icoStr} OR org.ico = ${icoStr})
      AND o.total_kc = ${Math.round(totalKc)}
      AND o.ordered_at > now() - interval '60 days'
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id AND i.doc_state = 'issued')
    ORDER BY o.ordered_at DESC LIMIT 1`);
  const match = rows.rows[0];
  return match
    ? `Odběratel má objednávku ${match.order_number} z e-shopu na stejnou částku bez vystavené faktury — vystav fakturu k ní přes invoice_preview → issue_invoice, nebo ji v detailu objednávky propoj s už vystavenou fakturou (link_order_invoice). Ruční faktura bez objednávky by vytvořila druhou fakturu.`
    : null;
}

const B2B_TOKEN_ORDER = "b2b";

const B2B_TOOLS: AgentTool[] = [
  defineTool({
    name: "prepare_b2b_invoice",
    title: "Připravit fakturu odběrateli (náhled, nic nevystaví)",
    description:
      "JEN ČTENÍ — nic nevystaví. Návrh ruční faktury v MojeBegina (jediná řada 2026xxxx) pro odběratele BEZ objednávky z e-shopu (kavárny, B2B) podle IČO. NIKDY pro objednávku z e-shopu (čísla 7000xxxx) — ta se fakturuje jen přes invoice_preview / issue_invoice: " +
      "položky, způsob úhrady (převodem / hotově / kartou), otevřená (neuhrazená) nebo uhrazená, splatnost, vlastní poznámka. Neuhrazená faktura převodem má na PDF QR kód k platbě (VS = číslo faktury). Ověří odběratele, další číslo a možné duplicity. " +
      "Celý náhled ukaž uživateli. Když canIssue=true, vrací preview_token pro issue_b2b_invoice (30 minut, jen pro tebe a jen pro tyto údaje).",
    write: false,
    visible: issuerOnly,
    properties: B2B_PROPERTIES,
    required: ["customer_ico", "items"],
    parse: (args) => b2bRawOf(args, []),
    execute: async (raw) => {
      const ctx = await getAuthContext();
      const result = await previewB2bInvoice(raw);
      if (!result.ok || !ctx) return result.ok ? { ok: false, error: "Nepřihlášený uživatel." } : result;
      const p = result.preview;
      const eshopGuard = await eshopOrderBlockingB2b(raw.ico, p.value.totalKc, raw.orderNumber);
      const reasons = [...(p.canIssueLive ? [] : [p.liveReason ?? "Ostré vystavování je vypnuté."]), ...p.blocking, ...(eshopGuard ? [eshopGuard] : [])];
      const canIssue = reasons.length === 0;
      const v = p.value;
      return {
        ok: true,
        summary: { canIssue, possibleDuplicates: p.similar.length },
        data: {
          canIssue,
          cannotIssueReasons: reasons,
          warnings: p.warnings,
          requiresConfirmNotDuplicate: p.similar.length > 0,
          possibleDuplicates: p.similar,
          series: p.series,
          expectedNumber: p.expectedNumber,
          customer: p.customer,
          invoice: {
            items: v.items,
            totalKc: v.totalKc,
            paymentMethod: v.paymentMethod,
            paymentLabel: p.paymentLabel,
            paid: v.paid,
            status: v.paid ? "uhrazená" : "otevřená (neuhrazená)",
            issueDate: v.issueDate,
            dueDate: v.dueDate,
            note: v.note,
            orderNumber: v.orderNumber,
            description: v.description,
          },
          sendsEmail: false,
          ...(canIssue
            ? {
                preview_token: signPreviewToken({ userId: ctx.userId, orderId: B2B_TOKEN_ORDER, fingerprint: p.fingerprint, issuedAt: Date.now() }, previewSecret()),
                previewValidMinutes: PREVIEW_TOKEN_MINUTES,
                nextStep:
                  "Ukaž uživateli odběratele, položky, celkem, způsob úhrady, stav (otevřená / uhrazená), splatnost, poznámku a varování. Až po jeho výslovném souhlasu zavolej issue_b2b_invoice se STEJNÝMI argumenty, preview_token, confirm=true a novým idempotency_key. Vystavení nic neposílá — PDF ukaž uživateli odkazem pdfUrl; zákazníkovi ho pošli jen na jeho výslovnou žádost.",
              }
            : {}),
        },
      };
    },
  }),
  defineTool({
    name: "issue_b2b_invoice",
    title: "Vystavit ruční fakturu odběrateli",
    description:
      "ZÁPIS DO ÚČETNICTVÍ — vystaví ruční fakturu v MojeBegina (řada 2026xxxx) přesně podle náhledu prepare_b2b_invoice: odběratel podle IČO, položky, " +
      "způsob úhrady, otevřená nebo uhrazená, splatnost, poznámka. Zákazníkovi nic neposílá. Volej JEN po výslovném souhlasu uživatele s náhledem, se STEJNÝMI argumenty + " +
      "preview_token, confirm=true a idempotency_key. Vrací číslo faktury a odkaz na PDF v MojeBegina.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      ...B2B_PROPERTIES,
      preview_token: { type: "string", description: "preview_token z prepare_b2b_invoice." },
      confirm: { type: "boolean", description: "true = uživatel výslovně potvrdil vystavení této faktury." },
      confirm_not_duplicate: { type: "boolean", description: "true jen když náhled hlásil možnou duplicitu a uživatel potvrdil, že jde o jinou fakturu." },
    },
    required: ["customer_ico", "items", "preview_token", "confirm"],
    parse: (args) => {
      const raw = b2bRawOf(args, ["preview_token", "confirm", "confirm_not_duplicate", "idempotency_key"]);
      if (args.confirm !== true) throw new ArgError("Fakturu lze vystavit jen s confirm=true po výslovném souhlasu uživatele s náhledem.");
      return { raw, token: requiredString(args, "preview_token", 2000), confirmNotDuplicate: args.confirm_not_duplicate === true };
    },
    execute: async ({ raw, token, confirmNotDuplicate }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `Fakturu smí vystavit jen ${INVOICE_ISSUER_NAMES}.` };
      const verified = verifyPreviewToken(token, { userId: ctx.userId, orderId: B2B_TOKEN_ORDER }, previewSecret());
      if (!verified.ok) return verified;
      const result = await createB2bInvoice(raw, { expectedFingerprint: verified.claims.fingerprint, confirmNotDuplicate, via: { via: "mcp", channel: "mcp", client: "chatgpt" } });
      if (!result.ok) {
        const list = result.existing?.length ? ` Podobné: ${result.existing.map((e) => `${e.number} (${e.totalKc} Kč, ${e.issueDate})`).join(", ")}.` : "";
        return { ok: false, error: `${result.error}${list}` };
      }
      return {
        ok: true,
        summary: { issued: true, paid: result.paid },
        data: {
          issued: true,
          invoiceNumber: result.invoiceNumber,
          totalKc: result.totalKc,
          status: result.paid ? "uhrazená" : "otevřená (neuhrazená)",
          dueDate: result.dueDate,
          customer: result.partnerName,
          contactCreated: result.contactCreated,
          warnings: result.warnings ?? [],
          pdfUrl: `${await appOrigin()}${result.pdfPath}`,
          emailed: false,
          message: `Faktura ${result.invoiceNumber} pro ${result.partnerName} na ${result.totalKc} Kč je vystavená (${result.paid ? "uhrazená" : "otevřená, splatnost " + result.dueDate}). Zákazníkovi se nic neposlalo.`,
        },
      };
    },
  }),
];

// ------------------------------------------------------------------ úpravy vlastních faktur (řada 2026xxxx)

const CHANGE_PROPERTIES: Record<string, unknown> = {
  number: { type: "string", description: "Číslo faktury MojeBegina, např. „20260215“." },
  action: { type: "string", enum: ["edit", "cancel", "delete"], description: "edit = upravit (stejné číslo, nová verze PDF), cancel = stornovat (číslo zůstane, nepočítá se), delete = smazat (jen poslední neodeslaná faktura v řadě; číslo se uvolní)." },
  payment_method: { type: "string", enum: [...OWN_PAYMENT_METHODS], description: "edit: nový způsob úhrady (bank_transfer / cash / card)." },
  paid_date: { type: "string", description: "edit: faktura je uhrazená k tomuto dni RRRR-MM-DD." },
  mark_unpaid: { type: "boolean", description: "edit: true = vrátit fakturu na neuhrazenou." },
  items: {
    type: "array",
    minItems: 1,
    maxItems: MAX_B2B_ITEMS,
    description: "edit: CELÝ nový seznam položek (nahradí stávající).",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        quantity: { type: "number" },
        unit: { type: "string" },
        unit_price_kc: { type: "number", description: "Záporná jen u řádku „Sleva“." },
      },
      required: ["name", "quantity", "unit_price_kc"],
      additionalProperties: false,
    },
  },
  note: { type: "string", description: "edit: nový text za položkami (prázdný = smazat)." },
  due_date: { type: "string", description: "edit: nová splatnost RRRR-MM-DD." },
  reason: { type: "string", description: "cancel: důvod storna (povinný)." },
};
const CHANGE_KEYS = Object.keys(CHANGE_PROPERTIES);
const CHANGE_TOKEN_ORDER = "own-invoice-change";

function changeOf(args: Record<string, unknown>, extra: string[]): OwnChangeInput {
  const unknown = Object.keys(args).filter((k) => !CHANGE_KEYS.includes(k) && !extra.includes(k));
  if (unknown.length) throw new ArgError(`Neznámé argumenty: ${unknown.join(", ")}.`);
  const number = requiredString(args, "number", 8);
  if (!/^\d{8}$/.test(number)) throw new ArgError("Číslo faktury má 8 číslic (např. 20260215).");
  const action = args.action;
  if (action !== "edit" && action !== "cancel" && action !== "delete") throw new ArgError("action musí být edit, cancel nebo delete.");
  const method = args.payment_method ?? null;
  if (method !== null && !(OWN_PAYMENT_METHODS as readonly unknown[]).includes(method)) throw new ArgError("payment_method musí být bank_transfer, cash nebo card.");
  const paidDate = optionalString(args, "paid_date", 10);
  if (paidDate && args.mark_unpaid === true) throw new ArgError("Zadejte buď paid_date, nebo mark_unpaid.");
  const items = Array.isArray(args.items)
    ? args.items.map((raw) => {
        const i = (raw ?? {}) as Record<string, unknown>;
        const quantity = Number(i.quantity);
        const unitPriceKc = Number(i.unit_price_kc);
        if (typeof i.name !== "string" || !Number.isFinite(quantity) || !Number.isFinite(unitPriceKc)) throw new ArgError("Položka musí mít name, quantity a unit_price_kc.");
        return { name: i.name, quantity, unit: typeof i.unit === "string" ? i.unit : null, unitPriceKc };
      })
    : null;
  return {
    number,
    action,
    paymentMethod: method as OwnChangeMethod | null,
    paidDate: args.mark_unpaid === true ? false : paidDate,
    items,
    note: typeof args.note === "string" ? args.note : null,
    dueDate: optionalString(args, "due_date", 10),
    reason: optionalString(args, "reason", 300),
  };
}

function changePreviewData(p: OwnChangePreview, userId: string) {
  const canApply = p.blocking.length === 0;
  return {
    canApply,
    cannotApplyReasons: p.blocking,
    warnings: p.warnings,
    invoice: p.document,
    action: p.action,
    changes: p.changes,
    sendsEmail: false,
    ...(canApply
      ? {
          preview_token: signPreviewToken({ userId, orderId: CHANGE_TOKEN_ORDER, fingerprint: p.fingerprint, issuedAt: Date.now() }, previewSecret()),
          previewValidMinutes: PREVIEW_TOKEN_MINUTES,
          nextStep:
            "Ukaž uživateli fakturu (číslo, odběratel, celkem, stav) a přesně co se změní, včetně varování. Až po jeho výslovném souhlasu zavolej apply_invoice_change se STEJNÝMI argumenty, preview_token, confirm=true a novým idempotency_key.",
        }
      : {}),
  };
}

const CHANGE_TOOLS: AgentTool[] = [
  defineTool({
    name: "prepare_invoice_change",
    title: "Připravit úpravu, storno nebo smazání faktury (náhled)",
    description:
      "JEN ČTENÍ — nic nezmění. Vystavená faktura MojeBegina (řada 2026xxxx): upravit (způsob úhrady, uhrazeno/neuhrazeno, položky, splatnost, poznámka — číslo zůstává, vznikne nová verze PDF, stará se archivuje), " +
      "stornovat (číslo zůstane, nepočítá se) nebo smazat (jen poslední faktura v řadě, která ještě neodešla zákazníkovi). Begina je neplátce DPH — dobropisy nedělej. " +
      "Celý náhled ukaž uživateli. Když canApply=true, vrací preview_token pro apply_invoice_change.",
    write: false,
    visible: issuerOnly,
    properties: CHANGE_PROPERTIES,
    required: ["number", "action"],
    parse: (args) => changeOf(args, []),
    execute: async (input) => {
      const ctx = await getAuthContext();
      if (!ctx) return { ok: false, error: "Nepřihlášený uživatel." };
      const result = await previewOwnInvoiceChange(input);
      if (!result.ok) return result;
      return { ok: true, summary: { canApply: result.preview.blocking.length === 0 }, data: changePreviewData(result.preview, ctx.userId) };
    },
  }),
  defineTool({
    name: "apply_invoice_change",
    title: "Upravit, stornovat nebo smazat fakturu",
    description:
      "ZÁPIS DO ÚČETNICTVÍ — provede úpravu / storno / smazání faktury MojeBegina přesně podle náhledu prepare_invoice_change. Zákazníkovi nic neposílá. " +
      "Volej JEN po výslovném souhlasu uživatele s náhledem, se STEJNÝMI argumenty + preview_token, confirm=true a idempotency_key.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      ...CHANGE_PROPERTIES,
      preview_token: { type: "string", description: "preview_token z prepare_invoice_change." },
      confirm: { type: "boolean", description: "true = uživatel výslovně potvrdil tuto změnu." },
    },
    required: ["number", "action", "preview_token", "confirm"],
    parse: (args) => {
      const input = changeOf(args, ["preview_token", "confirm", "idempotency_key"]);
      if (args.confirm !== true) throw new ArgError("Změnu lze provést jen s confirm=true po výslovném souhlasu uživatele s náhledem.");
      return { input, token: requiredString(args, "preview_token", 2000) };
    },
    execute: async ({ input, token }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `Faktury smí měnit jen ${INVOICE_ISSUER_NAMES}.` };
      const verified = verifyPreviewToken(token, { userId: ctx.userId, orderId: CHANGE_TOKEN_ORDER }, previewSecret());
      if (!verified.ok) return verified;
      const result = await applyOwnInvoiceChange(input, { expectedFingerprint: verified.claims.fingerprint, via: " (přes ChatGPT)" });
      if (!result.ok) return result;
      const verb = result.action === "edit" ? `upravená (verze ${result.version})` : result.action === "cancel" ? "stornovaná" : "smazaná (číslo je volné)";
      return {
        ok: true,
        summary: { done: true },
        data: {
          done: true,
          invoiceNumber: result.number,
          action: result.action,
          version: result.version,
          changes: result.changes,
          ...(result.action === "delete" ? {} : { pdfUrl: `${await appOrigin()}${ownInvoicePdfPath(result.number)}` }),
          emailed: false,
          message: `Faktura ${result.number} je ${verb}. Zákazníkovi se nic neposlalo.`,
        },
      };
    },
  }),
];

// ------------------------------------------------------------------ opravy faktur (řada Lucie)

const CORRECTION_PROPERTIES: Record<string, unknown> = {
  number: { type: "string", description: "Číslo faktury z Luciiny řady, např. „20260212“." },
  id: { type: "integer", description: "ID faktury v iDokladu (když číslo nestačí)." },
  payment_method: { type: "string", enum: [...CORRECTION_PAYMENT_METHODS], description: "Nový způsob úhrady na faktuře: bank_transfer (převodem), cash (hotově), card (kartou)." },
  payment_amount_kc: { type: "number", description: "Zaevidovat úhradu: částka v Kč — musí být celá zbývající částka faktury (částečné úhrady zatím ne)." },
  payment_date: { type: "string", description: "Den úhrady RRRR-MM-DD (s payment_amount_kc; ne v budoucnosti, nejvýš 60 dní zpět)." },
};
const CORRECTION_KEYS = Object.keys(CORRECTION_PROPERTIES);
const CORRECTION_TOKEN_ORDER = "invoice-correction";

function correctionOf(args: Record<string, unknown>, extra: string[]): InvoiceCorrectionInput {
  const unknown = Object.keys(args).filter((k) => !CORRECTION_KEYS.includes(k) && !extra.includes(k));
  if (unknown.length) throw new ArgError(`Neznámé argumenty: ${unknown.join(", ")}.`);
  const number = optionalString(args, "number", 20);
  const id = args.id === undefined || args.id === null ? null : Number(args.id);
  if (id !== null && !(Number.isInteger(id) && id > 0)) throw new ArgError("Argument id musí být kladné celé číslo.");
  const method = args.payment_method === undefined || args.payment_method === null ? null : args.payment_method;
  if (method !== null && !(CORRECTION_PAYMENT_METHODS as readonly unknown[]).includes(method)) throw new ArgError("payment_method musí být bank_transfer, cash nebo card.");
  const hasAmount = args.payment_amount_kc !== undefined && args.payment_amount_kc !== null;
  const date = optionalString(args, "payment_date", 10);
  if (hasAmount !== (date !== null)) throw new ArgError("Úhradu zadejte celou: payment_amount_kc i payment_date.");
  const amount = hasAmount ? Number(args.payment_amount_kc) : null;
  if (amount !== null && !Number.isFinite(amount)) throw new ArgError("payment_amount_kc musí být číslo.");
  return { invoiceId: id, number, paymentMethod: method as CorrectionPaymentMethod | null, payment: amount !== null && date ? { amountKc: amount, date } : null };
}

/** Oprava (způsob úhrady / úhrada) vlastní faktury = úprava edit. */
function ownCorrection(input: InvoiceCorrectionInput): OwnChangeInput {
  return { number: input.number!, action: "edit", paymentMethod: input.paymentMethod, paidDate: input.payment ? input.payment.date : null };
}
function ownCorrectionArgs(input: InvoiceCorrectionInput): Record<string, unknown> {
  return { number: input.number, action: "edit", ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}), ...(input.payment ? { paid_date: input.payment.date } : {}) };
}

const CORRECTION_TOOLS: AgentTool[] = [
  defineTool({
    name: "prepare_invoice_correction",
    title: "Připravit opravu úhrady faktury (náhled, nic nezmění)",
    description:
      "JEN ČTENÍ — nic nezmění. U vlastních faktur MojeBegina (od 20260215) přesměruje na prepare_invoice_change (úprava). Starší faktury z iDokladu: změna způsobu úhrady (převodem / hotově / kartou) a/nebo evidence úhrady " +
      "celé zbývající částky k danému dni. Novou fakturu ani dobropis nevystavuje, jiná pole nemění. Vrací současný stav faktury, co se změní, varování a blokující důvody. " +
      "Celý náhled ukaž uživateli. Když canApply=true, vrací preview_token pro apply_invoice_correction (30 minut, jen pro tebe a jen pro tyto údaje).",
    write: false,
    visible: issuerOnly,
    properties: CORRECTION_PROPERTIES,
    required: [],
    parse: (args) => correctionOf(args, []),
    execute: async (input) => {
      const ctx = await getAuthContext();
      if (ctx && (await isOwnInvoiceNumber(input.number))) {
        const own = await previewOwnInvoiceChange(ownCorrection(input));
        if (!own.ok) return own;
        return { ok: true, summary: { canApply: own.preview.blocking.length === 0 }, data: { ...changePreviewData(own.preview, ctx.userId), nextStep: "Vlastní faktura MojeBegina: po souhlasu uživatele zavolej apply_invoice_change s number, action=\"edit\", payment_method / paid_date jako v tomto náhledu, preview_token, confirm=true a novým idempotency_key." , ownChangeArgs: ownCorrectionArgs(input) } };
      }
      const result = await previewInvoiceCorrection(input);
      if (!result.ok || !ctx) return result.ok ? { ok: false, error: "Nepřihlášený uživatel." } : result;
      const p = result.preview;
      const reasons = [...(p.canApplyLive ? [] : [p.liveReason ?? "Ostré zápisy do iDokladu jsou vypnuté."]), ...p.blocking];
      const canApply = reasons.length === 0;
      return {
        ok: true,
        summary: { canApply },
        data: {
          canApply,
          cannotApplyReasons: reasons,
          warnings: p.warnings,
          invoice: p.invoice,
          changes: p.changes,
          createsNewInvoice: false,
          sendsEmail: false,
          ...(canApply
            ? {
                preview_token: signPreviewToken({ userId: ctx.userId, orderId: CORRECTION_TOKEN_ORDER, fingerprint: p.fingerprint, issuedAt: Date.now() }, previewSecret()),
                previewValidMinutes: PREVIEW_TOKEN_MINUTES,
                nextStep:
                  "Ukaž uživateli fakturu (číslo, odběratel, celkem, uhrazeno, zbývá, současný způsob úhrady) a přesně co se změní, včetně varování. Až po jeho výslovném souhlasu zavolej apply_invoice_correction se STEJNÝMI argumenty, preview_token, confirm=true a novým idempotency_key.",
              }
            : {}),
        },
      };
    },
  }),
  defineTool({
    name: "apply_invoice_correction",
    title: "Opravit fakturu v iDokladu (způsob úhrady, úhrada)",
    description:
      "ZÁPIS DO ÚČETNICTVÍ — provede opravu existující faktury z Luciiny řady přesně podle náhledu prepare_invoice_correction: změní způsob úhrady a/nebo zaeviduje úhradu " +
      "celé zbývající částky k danému dni. Novou fakturu nevystavuje, zákazníkovi nic neposílá. Pak ověří stav v iDokladu (zbývá 0 Kč) a text nového PDF (žádná výzva k úhradě ani upozornění na prodlení). " +
      "Volej JEN po výslovném souhlasu uživatele s náhledem, se STEJNÝMI argumenty + preview_token, confirm=true a idempotency_key. Když vrátí chybu, sděl uživateli její přesný text a neopakuj s novým klíčem bez kontroly faktury.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      ...CORRECTION_PROPERTIES,
      preview_token: { type: "string", description: "preview_token z prepare_invoice_correction." },
      confirm: { type: "boolean", description: "true = uživatel výslovně potvrdil tuto opravu faktury." },
    },
    required: ["preview_token", "confirm"],
    parse: (args) => {
      const input = correctionOf(args, ["preview_token", "confirm", "idempotency_key"]);
      if (args.confirm !== true) throw new ArgError("Fakturu lze opravit jen s confirm=true po výslovném souhlasu uživatele s náhledem.");
      return { input, token: requiredString(args, "preview_token", 2000) };
    },
    execute: async ({ input, token }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `Faktury v iDokladu smí opravovat jen ${INVOICE_ISSUER_NAMES}.` };
      const verified = verifyPreviewToken(token, { userId: ctx.userId, orderId: CORRECTION_TOKEN_ORDER }, previewSecret());
      if (!verified.ok) return verified;
      const result = await correctInvoice(input, { expectedFingerprint: verified.claims.fingerprint });
      if (!result.ok) return result;
      const inv = result.invoice;
      const done = [result.applied.paymentMethodChanged ? `způsob úhrady: ${inv.paymentMethod.name ?? "změněn"}` : null, result.applied.paymentRecorded ? `úhrada ${inv.paidKc} Kč (${inv.dateOfPayment ?? "—"})` : null]
        .filter(Boolean)
        .join(", ");
      return {
        ok: true,
        summary: { corrected: true, remainingKc: result.verified.remainingKc, pdfChecked: result.pdfCheck.checked, pdfOk: result.pdfCheck.checked && result.pdfCheck.ok },
        data: {
          corrected: true,
          invoice: inv,
          applied: result.applied,
          verified: result.verified,
          pdfCheck: result.pdfCheck,
          warnings: result.warnings,
          pdfUrl: `${await appOrigin()}${idokladInvoicePdfPath(inv.idokladId)}`,
          createdNewInvoice: false,
          emailed: false,
          message: `Faktura ${inv.number} je opravená (${done}); zbývá uhradit ${result.verified.remainingKc} Kč. Zákazníkovi se nic neposlalo.`,
        },
      };
    },
  }),
];

// Fio banka — příchozí platby na účtu (jen čtení, token „Pouze sledovat účet“).
// Zadání Lucie 15. 11. 2026: asistent má umět sám ověřit, jestli klient už
// zaplatil (dřív se muselo čekat, až se Jarin podívá do bankovnictví).
// Jen pro vystavovatele faktur (Jaroslav, Lucie). Odchozí platby: fio_outgoing_payments níže.
const FIO_MAX_DAYS = 90;
const FIO_TOOLS: AgentTool[] = [
  defineTool({
    name: "fio_incoming_payments",
    title: "Příchozí platby na účtu ve Fio",
    description:
      "JEN ČTENÍ — příchozí platby na firemním účtu Begina ve Fio bance za posledních N dní (výchozí 31, nejvýš 90). Volitelně jen platby s danou částkou (amount_kc), variabilním symbolem nebo částí názvu protiúčtu. Vrací datum, částku, variabilní symbol, název protiúčtu a zprávu pro příjemce a u každé platby vazbu (link): číslo objednávky a faktury v MojeBegina a stav „spárováno / nesedí částka / sedí, ale ještě není zapsáno jako zaplacené / nespárováno“ s důvodem. Vazba se jen čte, nic nepáruje; výplaty Stripe a platby bez symbolu jsou vždy nespárované. Odchozí platby vrací fio_outgoing_payments, zůstatek nevrací. Slouží k ověření, zda klient zaplatil fakturu. Údaje jsou důvěrné — nepředávej je mimo konverzaci s oprávněnou osobou. Fio dovoluje dotaz nejvýš jednou za 30 sekund.",
    write: false,
    visible: issuerOnly,
    properties: {
      days: { type: "integer", minimum: 1, maximum: FIO_MAX_DAYS, description: "Kolik dní zpět hledat (výchozí 31)." },
      amount_kc: { type: "number", description: "Jen platby přesně v této částce v Kč (např. 1304)." },
      variable_symbol: { type: "string", description: "Jen platby s tímto variabilním symbolem." },
      counterparty: { type: "string", description: "Část názvu protiúčtu (bez ohledu na velikost písmen a diakritiku)." },
    },
    required: [],
    parse: (args) => {
      const rawDays = args.days === undefined || args.days === null ? 31 : Number(args.days);
      if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > FIO_MAX_DAYS) throw new ArgError(`Argument days musí být celé číslo 1–${FIO_MAX_DAYS}.`);
      const rawAmount = args.amount_kc === undefined || args.amount_kc === null ? null : Number(String(args.amount_kc).replace(",", "."));
      if (rawAmount !== null && (!Number.isFinite(rawAmount) || rawAmount <= 0)) throw new ArgError("Argument amount_kc musí být kladné číslo.");
      const vs = optionalString(args, "variable_symbol", 10);
      if (vs !== null && !/^[0-9]{1,10}$/.test(vs)) throw new ArgError("Argument variable_symbol smí obsahovat jen číslice.");
      return { days: rawDays, amountHal: rawAmount === null ? null : Math.round(rawAmount * 100), vs, counterparty: optionalString(args, "counterparty", 80) };
    },
    execute: async ({ days, amountHal, vs, counterparty }) => {
      const token = process.env.FIO_API_TOKEN?.trim();
      if (!token) return { ok: false, error: "Napojení na Fio není nastavené (chybí FIO_API_TOKEN)." };
      const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
      const now = new Date();
      const from = day(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
      const fetched = await fetchFioTransactions(token, from, day(now));
      if (!fetched.ok) return { ok: false, error: `${fetched.error}. Fio dovoluje dotaz jednou za 30 sekund — zkuste to za chvíli znovu.` };
      const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const incoming = fetched.transactions.filter((t) => t.amountHal > 0);
      const matches = incoming.filter(
        (t) =>
          (amountHal === null || t.amountHal === amountHal) &&
          (vs === null || t.vs === vs.replace(/^0+(?=\d)/, "")) &&
          (counterparty === null || plain(t.counterparty ?? "").includes(plain(counterparty)))
      );
      const shown = matches.slice(0, 50);
      // Vazba na objednávku a fakturu (jen čtení). Výpadek databáze nesmí
      // zastavit čtení plateb — vazby pak chybí a řekne to varování.
      let links: Awaited<ReturnType<typeof linkFioPayments>> | null = null;
      try {
        links = await linkFioPayments(db, shown);
      } catch (error) {
        console.error("Fio: vazby plateb na objednávky se nepodařilo načíst", error instanceof Error ? error.message.slice(0, 200) : "neznámá chyba");
      }
      return {
        ok: true,
        summary: { found: matches.length },
        data: {
          period: { from, to: day(now) },
          incomingInPeriod: incoming.length,
          found: matches.length,
          truncated: matches.length > 50,
          payments: shown.map((t) => ({
            date: t.date,
            amountKc: t.amountHal / 100,
            currency: t.currency,
            variableSymbol: t.vs,
            counterparty: t.counterparty,
            message: t.message,
            link: links?.get(t.id) ?? null,
          })),
          ...(links ? {} : { warnings: ["Vazby plateb na objednávky a faktury se nepodařilo načíst (link = null neznamená nespárováno)."] }),
          source: { system: "Fio banka", readOnly: true },
        },
      };
    },
  }),
];

// Fio banka — odchozí platby z účtu (jen čtení, stejný token).
// Zadání Lucie 19. 11. 2026: asistent má sám dohledat skutečnou částku v Kč
// u plateb kartou v cizí měně (Vercel, Anthropic) a umět zkontrolovat, že
// žádná platba z účtu nechybí v nákladech. Jen pro vystavovatele faktur.
FIO_TOOLS.push(
  defineTool({
    name: "fio_outgoing_payments",
    title: "Odchozí platby z účtu ve Fio",
    description:
      "JEN ČTENÍ — odchozí platby z firemního účtu Begina ve Fio bance (platby kartou, převody, inkasa) za posledních N dní (výchozí 31, nejvýš 90). Volitelně jen platby s danou částkou v Kč (amount_kc, kladné číslo) nebo s textem (text) v protiúčtu, identifikaci obchodníka, zprávě, upřesnění či komentáři — např. „vercel“. Vrací datum, částku v Kč (kladně), typ pohybu, obchodníka/protiúčet, zprávu a upřesnění (u plateb v cizí měně původní částka a měna, např. „24.20 USD“). Slouží k doplnění skutečné částky v Kč do nákladů a ke kontrole, že žádná platba v nákladech nechybí. Zůstatek nevrací. Údaje jsou důvěrné. Fio dovoluje dotaz nejvýš jednou za 30 sekund.",
    write: false,
    visible: issuerOnly,
    properties: {
      days: { type: "integer", minimum: 1, maximum: FIO_MAX_DAYS, description: "Kolik dní zpět hledat (výchozí 31)." },
      amount_kc: { type: "number", description: "Jen platby přesně v této částce v Kč (kladné číslo, např. 512.37)." },
      text: { type: "string", description: "Část textu v protiúčtu, obchodníkovi, zprávě, upřesnění nebo komentáři (bez ohledu na velikost písmen a diakritiku), např. „vercel“." },
    },
    required: [],
    parse: (args) => {
      const rawDays = args.days === undefined || args.days === null ? 31 : Number(args.days);
      if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > FIO_MAX_DAYS) throw new ArgError(`Argument days musí být celé číslo 1–${FIO_MAX_DAYS}.`);
      const rawAmount = args.amount_kc === undefined || args.amount_kc === null ? null : Number(String(args.amount_kc).replace(",", "."));
      if (rawAmount !== null && (!Number.isFinite(rawAmount) || rawAmount <= 0)) throw new ArgError("Argument amount_kc musí být kladné číslo.");
      return { days: rawDays, amountHal: rawAmount === null ? null : Math.round(rawAmount * 100), text: optionalString(args, "text", 80) };
    },
    execute: async ({ days, amountHal, text }) => {
      const token = process.env.FIO_API_TOKEN?.trim();
      if (!token) return { ok: false, error: "Napojení na Fio není nastavené (chybí FIO_API_TOKEN)." };
      const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
      const now = new Date();
      const from = day(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
      const fetched = await fetchFioTransactions(token, from, day(now));
      if (!fetched.ok) return { ok: false, error: `${fetched.error}. Fio dovoluje dotaz jednou za 30 sekund — zkuste to za chvíli znovu.` };
      const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const outgoing = fetched.transactions.filter((t) => t.amountHal < 0);
      const matches = outgoing.filter((t) => {
        if (amountHal !== null && -t.amountHal !== amountHal) return false;
        if (text === null) return true;
        const haystack = plain([t.counterparty, t.ident, t.message, t.detail, t.comment].filter(Boolean).join(" "));
        return haystack.includes(plain(text));
      });
      return {
        ok: true,
        summary: { found: matches.length },
        data: {
          period: { from, to: day(now) },
          outgoingInPeriod: outgoing.length,
          found: matches.length,
          truncated: matches.length > 100,
          payments: matches.slice(0, 100).map((t) => ({
            date: t.date,
            amountKc: -t.amountHal / 100,
            currency: t.currency,
            kind: t.kind ?? null,
            counterparty: t.counterparty,
            merchant: t.ident ?? null,
            message: t.message,
            detail: t.detail ?? null,
            comment: t.comment ?? null,
          })),
          source: { system: "Fio banka", readOnly: true },
        },
      };
    },
  })
);

export const INVOICING_TOOLS: AgentTool[] = [...IDOKLAD_TOOLS, ...ISSUE_TOOLS, ...SEND_IDOKLAD_TOOLS, ...B2B_TOOLS, ...CHANGE_TOOLS, ...CORRECTION_TOOLS, ...FIO_TOOLS];
