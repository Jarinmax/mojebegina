// GPT/MCP — fakturace e-shopových objednávek přes asistenta. Žádná druhá
// integrace iDokladu: čtení je společné runIdokladRead (lib/idoklad-read),
// náhled a vystavení volají tutéž datovou vrstvu jako tlačítko „Vystavit
// fakturu v iDokladu“ v detailu objednávky (lib/data/orders.ts →
// issueAndSendInvoice: brána ostrého provozu, kontrola iDokladu, řada
// E-shop Begina 7277293, hledání podle VS, zámek, jedno odeslání PDF, Bcc).
//
// Postup asistenta: invoice_preview (jen čtení) → uživatel návrh vidí
// a výslovně potvrdí → issue_and_send_invoice s preview_token z náhledu,
// confirm=true a idempotency_key. Token je podepsaný (HMAC), platí 30 minut
// a jen pro stejného uživatele, stejnou objednávku a PŘESNĚ stejný návrh;
// změní-li se mezitím data objednávky, vystavení se zastaví.
//
// Nástroje vidí a smí volat jen vystavovatelé faktur (invoiceAuth.ts:
// Jaroslav Viner, Lucie Königsbergová) — server je ostatním nevypíše
// a volání odmítne (server.ts, visible).
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { issueOrderInvoiceDetailed, previewOrderInvoice, type InvoicePreviewLookup } from "@/lib/data/orders";
import { idokladAgentTools } from "@/lib/idoklad-read/mcp";
import { ArgError, optionalString, requiredString } from "../args";
import { defineTool, type AgentTool } from "../define";

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

const ISSUE_TOOLS: AgentTool[] = [
  defineTool({
    name: "invoice_preview",
    title: "Náhled faktury k objednávce",
    description:
      "JEN ČTENÍ — nic nevystaví ani neodešle. Sestaví návrh faktury k e-shopové (nebo z WooCommerce importované) objednávce přesně tak, jak by ji vystavilo MojeBegina " +
      "do iDokladu (řada E-shop Begina): odběratel, položky, doprava, sleva, celkem, VS, data, způsob úhrady; dále blokující problémy, zda je objednávka skutečně zaplacená, " +
      "dosavadní stav faktury (vystavená? PDF odesláno?) a komu by PDF odešlo (Komu + skrytá kopie). Celý náhled ukaž uživateli. " +
      "Když canIssue=true, vrací preview_token pro issue_and_send_invoice (platí 30 minut, jen pro tebe a jen pro tento návrh).",
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
      const alreadyDone = p.existing?.docState === "issued" && p.existing.pdfSent;
      const reasons = [
        ...(!p.mode.live ? [p.mode.reason] : []),
        ...(p.orderStatus.notPaidReason ? [p.orderStatus.notPaidReason] : []),
        ...(p.existing?.unclear ? [p.existing.unclear] : []),
        ...(p.existing?.docState === "issued" ? [] : p.blocking.map((b) => b.message)),
        ...(alreadyDone ? [`Faktura ${p.existing!.invoiceNumber ?? ""} už je vystavená a PDF odeslané — není co dělat.`] : []),
      ];
      const canIssue = reasons.length === 0;
      return {
        ok: true,
        summary: { canIssue, blocking: p.blocking.length, alreadyIssued: p.existing?.docState === "issued" },
        data: {
          ...p,
          action: p.existing?.docState === "issued" ? "send_pdf_only" : "issue_and_send",
          canIssue,
          cannotIssueReasons: reasons,
          ...(canIssue
            ? {
                preview_token: signPreviewToken(
                  { userId: ctx.userId, orderId: p.orderId, fingerprint: p.fingerprint, issuedAt: Date.now() },
                  previewSecret()
                ),
                previewValidMinutes: PREVIEW_TOKEN_MINUTES,
                nextStep:
                  "Ukaž uživateli celý náhled (odběratel, položky, celkem, příjemce e-mailu) a zeptej se, zda fakturu vystavit a odeslat. Až po jeho výslovném souhlasu zavolej issue_and_send_invoice s tímto preview_token, confirm=true a novým idempotency_key.",
              }
            : {}),
        },
      };
    },
  }),
  defineTool({
    name: "issue_and_send_invoice",
    title: "Vystavit fakturu v iDokladu a odeslat PDF",
    description:
      "ZÁPIS DO ÚČETNICTVÍ — vystaví fakturu v iDokladu (řada E-shop Begina), označí ji jako uhrazenou a jednou odešle PDF zákazníkovi (se skrytou kopií Begině). " +
      "Volej JEN poté, co jsi uživateli ukázal výsledek invoice_preview a on výslovně potvrdil vystavení. Vyžaduje preview_token z náhledu, confirm=true a idempotency_key. " +
      "Když se údaje objednávky od náhledu změnily nebo je stav nejasný, nic nevystaví a vrátí důvod — pak ho sděl uživateli a nic nezkoušej obcházet. " +
      "Už vystavenou fakturu nevystaví znovu (jen dorovná neodeslané PDF).",
    write: true,
    visible: issuerOnly,
    properties: {
      order_id: { type: "string", description: "id objednávky (UUID) — orderId z náhledu." },
      preview_token: { type: "string", description: "preview_token z invoice_preview." },
      confirm: { type: "boolean", description: "true = uživatel výslovně potvrdil vystavení a odeslání této faktury." },
    },
    required: ["order_id", "preview_token", "confirm"],
    parse: (args) => {
      const lookup = lookupOf({ order_id: args.order_id });
      if (args.confirm !== true) throw new ArgError("Fakturu lze vystavit jen s confirm=true po výslovném souhlasu uživatele s náhledem.");
      return { orderId: (lookup as { orderId: string }).orderId, token: requiredString(args, "preview_token", 2000) };
    },
    execute: async ({ orderId, token }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: "Fakturu do iDokladu smí vystavit jen Jaroslav Viner a Lucie Königsbergová." };
      const verified = verifyPreviewToken(token, { userId: ctx.userId, orderId }, previewSecret());
      if (!verified.ok) return verified;
      const result = await issueOrderInvoiceDetailed(orderId, { expectedFingerprint: verified.claims.fingerprint });
      if (!result.ok) return result;
      const pdf = result.emailed
        ? "PDF právě odešlo zákazníkovi (se skrytou kopií Begině)."
        : result.pdfSentBefore
          ? "PDF zákazník dostal už dříve — znovu se neposílalo."
          : result.emailInProgress
            ? "PDF právě odesílá jiný souběžný požadavek — znovu se neposílalo; ověřte za chvíli v detailu objednávky."
            : "PDF se NEPODAŘILO odeslat — zkontrolujte detail objednávky v MojeBegina (odeslání lze zopakovat tlačítkem Vystavit fakturu).";
      return {
        ok: true,
        summary: { issued: result.status === "issued", emailed: result.emailed },
        data: {
          orderId,
          status: result.status,
          invoiceNumber: result.invoiceNumber,
          emailed: result.emailed,
          pdfSentBefore: result.pdfSentBefore,
          emailInProgress: result.emailInProgress,
          message: `${result.message} ${pdf}`,
        },
      };
    },
  }),
];

export const INVOICING_TOOLS: AgentTool[] = [...IDOKLAD_TOOLS, ...ISSUE_TOOLS];
