// GPT/MCP — zápis objednávky do MojeBegina (např. potvrzená objednávka
// z Gmailu). Dva kroky:
//
//   prepare_order (jen čtení) — kontrola, dohledání zákazníka (IČO, e-mail,
//     telefon, název), odpovědné osoby a duplicit; vrací návrh, body
//     k rozhodnutí a podepsaný proposal_token (30 min, jen pro tohoto
//     uživatele a PŘESNĚ tento návrh),
//   create_order (zápis, mojebegina.write) — založí objednávku jen
//     s proposal_token, approval a idempotency_key.
//
// approval = "standing_instruction": trvalý pokyn Jaroslava (potvrzenou
// objednávku Begina.cz z Gmailu rovnou zapsat) — server ho přijme JEN pro
// čistý návrh (autoCreateAllowed), jinak nic nezaloží. „user_confirmed“ =
// uživatel výslovně rozhodl o tomto konkrétním návrhu.
//
// Datová vrstva: lib/data/orderIntake.ts (requireOrderContext — stejná
// oprávnění jako ruční „Nová objednávka“). Existující objednávku nic z toho
// nemění.
//
// get_order / list_orders (jen čtení) a update_order_fulfillment (zápis,
// mojebegina.write) — MCP objednávky 1.1, plánování rozvozů. Datová vrstva:
// lib/data/orders.ts (getOrderDetail, updateOrderFulfillmentViaAgent) a
// lib/data/agentOrders.ts (listOrdersForAgent) — stejná brána
// (requireOrderContext) jako create_order výše. update_order_fulfillment
// POVOLENÉ přechody hlídá (lib/data/orderFulfillmentAgentValidation.ts) —
// žádné přeskakování kroků; stejný cíl jako aktuální stav = bezpečný no-op.
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthContext } from "@/lib/data/authContext";
import { createOrderFromIntake, planOrderIntake } from "@/lib/data/orderIntake";
import { DIC_SOURCES, INTAKE_FULFILLMENT_STATUSES, ORDER_SOURCES, type OrderIntakeInput } from "@/lib/data/orderIntakeValidation";
import type { IntakeApproval } from "@/lib/data/orderIntake";
import { getOrderDetail, updateOrderFulfillmentViaAgent } from "@/lib/data/orders";
import { listOrdersForAgent, type AgentOrderFilter } from "@/lib/data/agentOrders";
import {
  ALLOWED_FULFILLMENT_TRANSITIONS,
  validateUpdateOrderFulfillmentInput,
} from "@/lib/data/orderFulfillmentAgentValidation";
import { FULFILLMENT_STATUSES, PAYMENT_STATUSES } from "@/lib/data/orderValidation";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/data/orderLabels";
import { formatPragueDateTime } from "@/lib/data/callActivityValidation";
import { ArgError, optionalBoolean, optionalEnum, optionalEnumArray, optionalString, requiredString, requiredUuid } from "../args";
import { defineTool, type AgentTool } from "../define";
import { PAGING_PROPERTIES, pageInfo, parsePaging } from "../envelope";
import { DATE_DESCRIPTION, optionalRange, periodOf, sourceFor } from "./shared";

export const PROPOSAL_TOKEN_MINUTES = 30;
const MAX_ITEMS = 50;

export const orderUrl = (issuer: string, id: string) => `${issuer}/rizeni-firmy/objednavky/${id}`;

// ------------------------------------------------------------------ podepsaný návrh

export type ProposalClaims = { userId: string; fingerprint: string; issuedAt: number };

function tokenKey(secret: string): Buffer {
  return createHash("sha256").update(`mojebegina:order-proposal:${secret}`).digest();
}

function proposalSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.MCP_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new Error("MCP_OAUTH_CLIENT_SECRET chybí");
  return secret;
}

export function signProposalToken(claims: ProposalClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `o1.${body}.${createHmac("sha256", tokenKey(secret)).update(body).digest("base64url")}`;
}

export function verifyProposalToken(
  token: string,
  userId: string,
  secret: string,
  now: number = Date.now()
): { ok: true; claims: ProposalClaims } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "proposal_token je neplatný — připravte nejdřív návrh (prepare_order) se stejnými údaji a použijte token z něj." };
  const [version, body, mac] = token.split(".");
  if (version !== "o1" || !body || !mac) return invalid;
  const good = createHmac("sha256", tokenKey(secret)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return invalid;
  let claims: ProposalClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ProposalClaims;
  } catch {
    return invalid;
  }
  if (claims.userId !== userId) return { ok: false, error: "Návrh objednávky připravil jiný uživatel — připravte ho znovu pod svým účtem." };
  if (!(now - claims.issuedAt >= 0 && now - claims.issuedAt <= PROPOSAL_TOKEN_MINUTES * 60_000)) {
    return { ok: false, error: `Návrh objednávky je starší než ${PROPOSAL_TOKEN_MINUTES} minut — připravte ho znovu a nechte ho potvrdit.` };
  }
  return { ok: true, claims };
}

// ------------------------------------------------------------------ argumenty

const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "integer", minimum: 0, description });

function requiredEnum<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[]): T {
  const value = optionalEnum(args, key, allowed);
  if (value === null) throw new ArgError(`Chybí argument ${key}.`);
  return value;
}

// Plánování rozvozů řeší dny/týdny dopředu, ne čtvrtrok jako CRM filtry.
const MAX_PLANNED_DELIVERY_RANGE_DAYS = 31;

const ORDER_PROPERTIES: Record<string, unknown> = {
  source: {
    type: "string",
    enum: [...ORDER_SOURCES],
    description: "Zdroj objednávky: eshop (objednávka z e-shopu begina.cz — uloží se jako e-shopová s číslem WooCommerce), gmail (objednávka e-mailem), phone (telefon), manual (ruční).",
  },
  external_reference: S("Externí číslo objednávky. U eshop číslo objednávky z begina.cz (WooCommerce, jen číslice, např. 5217); u gmail číslo z e-mailu, případně ID zprávy. U eshop a gmail povinné — chrání proti dvojímu zápisu."),
  external_invoice_number: S("Číslo faktury, která k objednávce UŽ existuje mimo MojeBegina (např. v iDokladu 20260185). MojeBegina pak k objednávce žádnou fakturu nevystaví ani nepošle."),
  organization_id: S("id existujícího zákazníka (UUID) — když už je známý, např. z kandidátů prepare_order nebo ze search_mojebegina."),
  customer_ico: S("IČO zákazníka (8 číslic). Podle něj se najde existující firma; když neexistuje, s customer_name a customer_address se založí nová."),
  customer_name: S("Název firmy zákazníka (pro dohledání; u nové firmy povinný)."),
  customer_address: S("Sídlo firmy (fakturační adresa) — u nové firmy povinné."),
  customer_dic: S("DIČ firmy, např. CZ12345678 — JEN když je výslovně uvedené v podkladu (faktura, iDoklad, objednávka, rejstřík). Nikdy ho neodvozuj z IČO. U existující firmy se doplní jen prázdné DIČ, existující se nepřepisuje."),
  customer_dic_source: { type: "string", enum: [...DIC_SOURCES], description: "Odkud DIČ je (povinné s customer_dic): idoklad, invoice (faktura), order (objednávka), company_register (rejstřík / ARES)." },
  customer_dic_reference: S("Doklad, ze kterého DIČ je (např. „faktura 20260185“)."),
  contact_name: S("Kontaktní osoba."),
  contact_email: S("E-mail kontaktní osoby (slouží i k dohledání zákazníka)."),
  contact_phone: S("Telefon kontaktní osoby (slouží i k dohledání zákazníka)."),
  items: {
    type: "array",
    minItems: 1,
    maxItems: MAX_ITEMS,
    description: "Položky objednávky.",
    items: {
      type: "object",
      properties: {
        name: S("Název položky (jak má být na objednávce)."),
        quantity: { type: "integer", minimum: 1, description: "Množství (ks)." },
        unit_price_kc: N("Jednotková cena v Kč (celé číslo, cena pro zákazníka)."),
        sku: S("SKU balení z katalogu MojeBegina (nepovinné — propojí položku s katalogem)."),
      },
      required: ["name", "quantity", "unit_price_kc"],
      additionalProperties: false,
    },
  },
  shipping_kc: N("Cena dopravy v Kč (výchozí 0)."),
  shipping_method: S("Způsob dopravy (text, např. Rozvoz Begina, PPL, osobní odběr)."),
  payment_method: S("Způsob platby (text, např. převodem na fakturu, hotově, kartou)."),
  payment_status: { type: "string", enum: [...PAYMENT_STATUSES], description: "Stav platby: unpaid (výchozí), invoiced, paid." },
  paid_by_card: {
    type: "boolean",
    description: "true = objednávka z e-shopu begina.cz je už zaplacená kartou (potvrzení platby v e-mailu). Zapíše se úhrada kartou, faktura pak půjde vystavit hned jako uhrazená. Jen se source=eshop.",
  },
  fulfillment_status: { type: "string", enum: [...INTAKE_FULFILLMENT_STATUSES], description: "Stav objednávky (výchozí new)." },
  ordered_at: S("Datum objednávky RRRR-MM-DD (výchozí dnes)."),
  planned_delivery_at: S("Požadovaný termín doručení RRRR-MM-DD."),
  delivery_name: S("Příjemce zásilky (když se liší od zákazníka)."),
  delivery_address: S("Doručovací adresa."),
  delivery_phone: S("Telefon příjemce."),
  note: S("Interní poznámka (max. 2000 znaků)."),
  customer_note: S("Poznámka od zákazníka (z e-mailu)."),
  responsible: S("Odpovědná osoba v Begině — jméno nebo e-mail."),
  expected_total_kc: N("Celková cena z podkladu (kontrola) — musí se rovnat položkám + dopravě, jinak se nic nezaloží."),
};

function str(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ArgError(`Argument ${key} musí být text.`);
  return value;
}

function num(args: Record<string, unknown>, key: string): number | string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && typeof value !== "string") throw new ArgError(`Argument ${key} musí být číslo.`);
  return value;
}

function intakeOf(args: Record<string, unknown>): OrderIntakeInput {
  const items = args.items;
  if (!Array.isArray(items) || items.length === 0) throw new ArgError("Chybí položky objednávky (items).");
  if (items.length > MAX_ITEMS) throw new ArgError(`Objednávka může mít nejvýše ${MAX_ITEMS} položek.`);
  return {
    source: str(args, "source") ?? "",
    externalReference: str(args, "external_reference"),
    externalInvoiceNumber: str(args, "external_invoice_number"),
    organizationId: str(args, "organization_id"),
    customerIco: str(args, "customer_ico"),
    customerName: str(args, "customer_name"),
    customerAddress: str(args, "customer_address"),
    customerDic: str(args, "customer_dic"),
    customerDicSource: str(args, "customer_dic_source"),
    customerDicReference: str(args, "customer_dic_reference"),
    contactName: str(args, "contact_name"),
    contactEmail: str(args, "contact_email"),
    contactPhone: str(args, "contact_phone"),
    items: items.map((raw, i) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ArgError(`Položka ${i + 1} musí být objekt.`);
      const item = raw as Record<string, unknown>;
      return { name: str(item, "name") ?? "", quantity: num(item, "quantity") ?? "", unitPriceKc: num(item, "unit_price_kc") ?? "", sku: str(item, "sku") };
    }),
    shippingKc: num(args, "shipping_kc"),
    shippingMethod: str(args, "shipping_method"),
    paymentMethod: str(args, "payment_method"),
    paymentStatus: str(args, "payment_status"),
    paidByCard: optionalBoolean(args, "paid_by_card"),
    fulfillmentStatus: str(args, "fulfillment_status"),
    orderedAt: str(args, "ordered_at"),
    plannedDeliveryAt: str(args, "planned_delivery_at"),
    deliveryName: str(args, "delivery_name"),
    deliveryAddress: str(args, "delivery_address"),
    deliveryPhone: str(args, "delivery_phone"),
    note: str(args, "note"),
    customerNote: str(args, "customer_note"),
    responsible: str(args, "responsible"),
    expectedTotalKc: num(args, "expected_total_kc"),
  };
}

const ORDER_KEYS = Object.keys(ORDER_PROPERTIES);
function onlyKnown(args: Record<string, unknown>, extra: string[]) {
  const unknown = Object.keys(args).filter((k) => !ORDER_KEYS.includes(k) && !extra.includes(k));
  if (unknown.length > 0) throw new ArgError(`Neznámé argumenty: ${unknown.join(", ")}.`);
}

// ------------------------------------------------------------------ nástroje

export const ORDER_TOOLS: AgentTool[] = [
  defineTool({
    name: "prepare_order",
    title: "Připravit objednávku (návrh, nic nezapíše)",
    description:
      "JEN ČTENÍ — nic nezaloží. Zkontroluje objednávku (např. potvrzenou v Gmailu) před zápisem do MojeBegina: spočítá součty a porovná je s expected_total_kc, " +
      "dohledá existujícího zákazníka podle IČO, e-mailu, telefonu a názvu (candidates), odpovědnou osobu, balení podle SKU a možné duplicity. " +
      "Vrací blocking (nelze zapsat), decisionReasons (zapsat jen po rozhodnutí Jaroslava), warnings (jen informace) a autoCreateAllowed. " +
      "Když canCreate=true, vrací proposal_token pro create_order (platí 30 minut, jen pro tebe a jen pro tyto údaje — create_order musí dostat STEJNÉ argumenty).",
    write: false,
    properties: ORDER_PROPERTIES,
    required: ["source", "items"],
    parse: (args) => {
      onlyKnown(args, []);
      return intakeOf(args);
    },
    execute: async (input) => {
      const ctx = await getAuthContext();
      const planned = await planOrderIntake(input);
      if (!planned.ok || !ctx) return planned.ok ? { ok: false, error: "Nepřihlášený uživatel." } : planned;
      const { plan } = planned;
      const canCreate = plan.blocking.length === 0;
      const auto = plan.autoCreateAllowed;
      const v = plan.value;
      return {
        ok: true,
        summary: { canCreate, autoCreateAllowed: auto, blocking: plan.blocking.length, decisionReasons: plan.decisionReasons.length },
        data: {
          canCreate,
          autoCreateAllowed: auto,
          blocking: plan.blocking,
          decisionReasons: plan.decisionReasons,
          warnings: plan.warnings,
          customer: plan.customer,
          customerUpdate: plan.customerUpdate,
          candidates: plan.candidates,
          duplicates: plan.duplicates,
          possibleDuplicates: plan.similar,
          requiresConfirmNotDuplicate: plan.similar.length > 0,
          order: {
            source: v.source,
            channel: v.channel,
            externalReference: v.externalReference,
            externalInvoiceNumber: v.externalInvoiceNumber,
            orderedAt: v.orderedAt,
            plannedDeliveryAt: v.plannedDeliveryAt,
            contact: { name: v.contactName, email: v.contactEmail, phone: v.contactPhone },
            delivery: { name: v.deliveryName, address: v.deliveryAddress, phone: v.deliveryPhone, method: v.shippingMethod },
            items: v.items.map((item, i) => ({ ...item, linkedToCatalog: plan.variantIds[i] !== null })),
            subtotalKc: v.subtotalKc,
            shippingKc: v.shippingKc,
            totalKc: v.totalKc,
            paymentMethod: v.paymentMethod,
            paymentStatus: v.paymentStatus,
            fulfillmentStatus: v.fulfillmentStatus,
            responsible: plan.responsible,
            note: v.note,
            customerNote: v.customerNote,
          },
          ...(canCreate
            ? {
                proposal_token: signProposalToken({ userId: ctx.userId, fingerprint: plan.fingerprint, issuedAt: Date.now() }, proposalSecret()),
                proposalValidMinutes: PROPOSAL_TOKEN_MINUTES,
                nextStep: auto
                  ? "Čistý návrh: podle trvalého pokynu Jaroslava můžeš rovnou zavolat create_order se STEJNÝMI argumenty, proposal_token, approval=\"standing_instruction\" a novým idempotency_key. Uživateli pak oznam číslo a odkaz zapsané objednávky."
                  : "Návrh NENÍ čistý — nic nezapisuj. Ukaž Jaroslavovi decisionReasons a návrh a vyžádej si jeho rozhodnutí. Zapsat smíš až po jeho výslovném souhlasu: create_order se STEJNÝMI argumenty, proposal_token, approval=\"user_confirmed\" a novým idempotency_key" +
                    (plan.similar.length > 0 ? " — u možné duplicity navíc confirm_not_duplicate=true, jen když potvrdí, že jde o jinou objednávku." : "."),
              }
            : {}),
        },
      };
    },
  }),
  defineTool({
    name: "create_order",
    title: "Zapsat objednávku do MojeBegina",
    description:
      "ZÁPIS — založí NOVOU objednávku v MojeBegina (existující nikdy nemění, žádný e-mail ani fakturu neposílá). Volej JEN po prepare_order se STEJNÝMI argumenty + proposal_token a idempotency_key. " +
      "approval=\"standing_instruction\" (trvalý pokyn Jaroslava zapisovat potvrzené objednávky) jen když prepare_order vrátil autoCreateAllowed=true — server to ověří znovu; " +
      "approval=\"user_confirmed\" jen po výslovném rozhodnutí uživatele o tomto návrhu. Když se údaje mezitím změnily, objednávka se stejným externím číslem už existuje " +
      "nebo návrh není čistý, nic nezaloží a vrátí důvod — ten sděl uživateli. Vrací id, číslo objednávky a odkaz pro kontrolu.",
    write: true,
    properties: {
      ...ORDER_PROPERTIES,
      proposal_token: S("proposal_token z prepare_order."),
      approval: {
        type: "string",
        enum: ["standing_instruction", "user_confirmed"],
        description: "standing_instruction = trvalý pokyn Jaroslava (jen čistý návrh, autoCreateAllowed=true); user_confirmed = uživatel výslovně rozhodl o tomto návrhu.",
      },
      confirm_not_duplicate: { type: "boolean", description: "true jen když prepare_order hlásil možnou duplicitu a uživatel rozhodl, že jde o jinou objednávku (jen s approval=user_confirmed)." },
    },
    required: ["source", "items", "proposal_token", "approval"],
    parse: (args) => {
      onlyKnown(args, ["proposal_token", "approval", "confirm_not_duplicate", "idempotency_key"]);
      const approval = optionalEnum<IntakeApproval>(args, "approval", ["standing_instruction", "user_confirmed"]);
      if (approval === null) throw new ArgError("Chybí approval: standing_instruction (čistý návrh podle trvalého pokynu), nebo user_confirmed (výslovné rozhodnutí uživatele).");
      const confirmNotDuplicate = optionalBoolean(args, "confirm_not_duplicate") === true;
      if (confirmNotDuplicate && approval !== "user_confirmed") throw new ArgError("confirm_not_duplicate smí přijít jen s approval=user_confirmed — o možné duplicitě rozhoduje uživatel.");
      return { input: intakeOf(args), token: requiredString(args, "proposal_token", 2000), approval, confirmNotDuplicate };
    },
    execute: async ({ input, token, approval, confirmNotDuplicate }, issuer) => {
      const ctx = await getAuthContext();
      if (!ctx) return { ok: false, error: "Nepřihlášený uživatel." };
      const verified = verifyProposalToken(token, ctx.userId, proposalSecret());
      if (!verified.ok) return verified;
      const result = await createOrderFromIntake(input, {
        expectedFingerprint: verified.claims.fingerprint,
        approval,
        confirmNotDuplicate,
        via: { client: "chatgpt" },
      });
      if (!result.ok) {
        if (!result.existing?.length) return { ok: false, error: result.error };
        const list = result.existing.map((o) => `${o.externalWooCommerceId ?? o.orderNumber ?? o.orderId} (${o.totalKc} Kč, ${orderUrl(issuer, o.orderId)})`).join("; ");
        return { ok: false, error: `${result.error} Existující: ${list}.` };
      }
      return {
        ok: true,
        summary: { created: true, newCustomer: result.customer.created },
        data: {
          created: true,
          orderId: result.orderId,
          // číslo objednávky: e-shop begina.cz = číslo WooCommerce, jinak číslo z MojeBegina (= VS)
          orderNumber: result.externalWooCommerceId ?? result.orderNumber,
          externalWooCommerceId: result.externalWooCommerceId,
          paymentVs: result.paymentVs,
          channel: result.channel,
          approval,
          url: orderUrl(issuer, result.orderId),
          customer: result.customer,
          totalKc: result.totalKc,
          message:
            `Objednávka ${result.externalWooCommerceId ?? result.orderNumber ?? result.orderId} je zapsaná` +
            (result.customer.created ? ` (nový zákazník ${result.customer.name}, IČO ${result.customer.ico})` : ` pro ${result.customer.name}`) +
            `, celkem ${result.totalKc} Kč.` +
            (result.customer.dicFilled ? ` U zákazníka doplněno DIČ ${result.customer.dicFilled}.` : "") +
            " Žádný e-mail ani faktura se neposlaly.",
        },
      };
    },
  }),

  // ------------------------------------------------------------------ plánování rozvozů

  defineTool({
    name: "get_order",
    title: "Detail objednávky",
    description:
      "JEN ČTENÍ — úplný detail jedné objednávky: zákazník, kontakt, fakturační a dodací adresa, položky a ceny, stav platby i vyřízení, " +
      "aktuální přepravce a tracking, poznámky a celá historie změn (kdo, kdy, odkud kam, přes ChatGPT). allowedNextStatuses ukazuje, na co jde stav ZMĚNIT (update_order_fulfillment). " +
      "id najděte nejdřív přes list_orders nebo search_mojebegina — nikdy ho nevymýšlejte.",
    write: false,
    properties: { order_id: { type: "string", description: "id objednávky (UUID)." } },
    required: ["order_id"],
    parse: (args) => requiredUuid(args, "order_id"),
    execute: async (orderId, issuer) => {
      const detail = await getOrderDetail(orderId);
      if (!detail) return { ok: false, error: "Objednávka nebyla nalezena." };
      const o = detail.order;
      return {
        ok: true,
        data: {
          id: o.id,
          orderNumber: o.orderNumber,
          customer: {
            organizationId: o.buyerOrganizationId,
            organizationName: o.buyerOrganizationName,
            contactName: o.contactName,
            contactPhone: o.contactPhone,
            contactEmail: o.contactEmail,
          },
          billingAddress: o.buyerOrganizationAddress,
          delivery: {
            recipientName: o.recipientName,
            address: o.recipientAddress,
            phone: o.recipientPhone,
            method: o.shippingMethodLabel,
            plannedAtPrague: o.plannedDeliveryAt ? formatPragueDateTime(o.plannedDeliveryAt) : null,
            carrier: o.carrier,
            trackingNumber: o.trackingNumber,
          },
          items: detail.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPriceKc: item.unitPriceKc,
            lineTotalKc: item.lineTotalKc,
          })),
          subtotalKc: o.subtotalKc,
          shippingKc: o.shippingKc,
          totalKc: o.totalKc,
          paymentStatus: o.paymentStatus,
          paymentStatusLabel: PAYMENT_LABELS[o.paymentStatus],
          paymentOverdue: o.paymentOverdue,
          fulfillmentStatus: o.fulfillmentStatus,
          fulfillmentStatusLabel: FULFILLMENT_LABELS[o.fulfillmentStatus],
          allowedNextStatuses: ALLOWED_FULFILLMENT_TRANSITIONS[o.fulfillmentStatus],
          note: o.note,
          customerNote: o.customerNote,
          orderedAtPrague: formatPragueDateTime(o.orderedAt),
          activity: detail.activity.map((entry) => ({
            kind: entry.kind,
            authorName: entry.authorName,
            body: entry.body,
            metadata: entry.metadata,
            atPrague: formatPragueDateTime(entry.createdAt),
          })),
          url: orderUrl(issuer, o.id),
          source: await sourceFor(["orders"]),
        },
      };
    },
  }),

  defineTool({
    name: "list_orders",
    title: "Seznam objednávek (plánování rozvozů, kontrola nevyřízených)",
    description:
      "JEN ČTENÍ — objednávky s filtry pro plánování tras a kontrolu nevyřízených zásilek: zákazník (jméno/e-mail/telefon/firma), číslo objednávky, stav vyřízení, stav platby, " +
      "termín plánovaného doručení a přepravce. Bez filtrů vrací nejbližší plánovaná doručení napřed. Stránkuje se přes cursor (max. 50 na stránku); celkový počet je v totalMatching.",
    write: false,
    properties: {
      customer: { type: "string", description: "Volný text — jméno/e-mail/telefon kontaktu nebo název zákazníka (organizace)." },
      order_number: { type: "integer", minimum: 1, description: "Přesné číslo objednávky." },
      fulfillment_statuses: {
        type: "array",
        items: { type: "string", enum: [...FULFILLMENT_STATUSES] },
        description: "Jen tyto stavy vyřízení.",
      },
      payment_statuses: {
        type: "array",
        items: { type: "string", enum: [...PAYMENT_STATUSES] },
        description: "Jen tyto stavy platby.",
      },
      planned_delivery_from: { type: "string", description: `Plánované doručení od ${DATE_DESCRIPTION}` },
      planned_delivery_to: { type: "string", description: `Plánované doručení do (včetně) ${DATE_DESCRIPTION}` },
      carrier: { type: "string", description: "Volný text proti aktuálně nastavenému přepravci (např. CoolBalík)." },
      ...PAGING_PROPERTIES,
    },
    required: [],
    parse: (args) => {
      const filters: AgentOrderFilter = {
        customer: optionalString(args, "customer", 200),
        orderNumber: (() => {
          const value = args.order_number;
          if (value === undefined || value === null) return null;
          if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
            throw new ArgError("Argument order_number musí být kladné celé číslo.");
          }
          return value;
        })(),
        fulfillmentStatuses: optionalEnumArray(args, "fulfillment_statuses", FULFILLMENT_STATUSES),
        paymentStatuses: optionalEnumArray(args, "payment_statuses", PAYMENT_STATUSES),
        plannedDelivery: optionalRange(args, "planned_delivery_from", "planned_delivery_to", MAX_PLANNED_DELIVERY_RANGE_DAYS),
        carrier: optionalString(args, "carrier", 200),
      };
      return { filters, paging: parsePaging(args, filters) };
    },
    execute: async ({ filters, paging }, issuer) => {
      const { total, rows } = await listOrdersForAgent(filters, paging);
      const page = pageInfo(total, paging, rows.length);
      return {
        ok: true,
        summary: { totalMatching: total, returned: rows.length, truncated: page.truncated },
        data: {
          totalMatching: total,
          orders: rows.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            customer: o.buyerOrganizationName,
            contactName: o.contactName,
            itemsSummary: o.itemsSummary,
            totalKc: o.totalKc,
            orderedAtPrague: formatPragueDateTime(o.orderedAt),
            plannedDeliveryAtPrague: o.plannedDeliveryAt ? formatPragueDateTime(o.plannedDeliveryAt) : null,
            fulfillmentStatus: o.fulfillmentStatus,
            fulfillmentStatusLabel: FULFILLMENT_LABELS[o.fulfillmentStatus],
            paymentStatus: o.paymentStatus,
            paymentStatusLabel: PAYMENT_LABELS[o.paymentStatus],
            paymentOverdue: o.paymentOverdue,
            carrier: o.carrier,
            trackingNumber: o.trackingNumber,
            url: orderUrl(issuer, o.id),
          })),
          source: await sourceFor(["orders"], { period: periodOf(filters.plannedDelivery), page }),
        },
      };
    },
  }),

  defineTool({
    name: "update_order_fulfillment",
    title: "Změnit stav vyřízení objednávky (rozvoz)",
    description:
      "ZÁPIS — bezpečný přechod stavu VYŘÍZENÍ objednávky (NE stavu platby — ty jsou nezávislé). Povolené přechody: " +
      "new→confirmed→preparing→ready→{out_for_delivery nebo handed_to_carrier}→delivered; cancelled jde nastavit z kteréhokoli nedokončeného stavu. " +
      "delivered navíc smí couvnout ZPĚT na handed_to_carrier nebo out_for_delivery — oprava předčasně/chybně označeného doručení (kurýr jen převzal, zákazník ještě nepřevzal), ne dál. " +
      "Jiné přeskočení kroku nebo couvnutí nedovolí — při nepovoleném přechodu nic nezapíše a vrátí chybu. Stejný cíl, jaký objednávka UŽ MÁ, je bezpečný no-op (nic se nezdvojí). " +
      "event_at je čas SKUTEČNÉ události (kdy se to stalo), ne kdy o tom píšete. carrier/tracking_number se uloží jako AKTUÁLNÍ hodnota na objednávce. " +
      "id najděte nejdřív přes get_order nebo list_orders.",
    write: true,
    properties: {
      order_id: { type: "string", description: "id objednávky (UUID) z get_order nebo list_orders." },
      target_status: { type: "string", enum: [...FULFILLMENT_STATUSES], description: "Cílový stav vyřízení." },
      event_at: { type: "string", description: "Kdy se to skutečně stalo (RRRR-MM-DD nebo RRRR-MM-DDTHH:mm). Bez zadání se použije teď." },
      carrier: { type: "string", description: "Přepravce, např. CoolBalík (uloží se jako aktuální)." },
      tracking_number: { type: "string", description: "Tracking/podací číslo u přepravce (uloží se jako aktuální)." },
      note: { type: "string", description: "Poznámka k téhle změně (max. 2000 znaků) — uvidí ji i v historii objednávky v MojeBegina." },
    },
    required: ["order_id", "target_status"],
    parse: (args) => ({
      orderId: requiredUuid(args, "order_id"),
      targetStatus: requiredEnum(args, "target_status", FULFILLMENT_STATUSES),
      eventAt: optionalString(args, "event_at", 40),
      carrier: optionalString(args, "carrier", 200),
      trackingNumber: optionalString(args, "tracking_number", 200),
      note: optionalString(args, "note", 2000),
    }),
    execute: async (parsed, issuer) => {
      const validated = validateUpdateOrderFulfillmentInput(parsed);
      if (!validated.ok) return validated;
      const result = await updateOrderFulfillmentViaAgent(validated.value);
      if (!result.ok) return result;
      return {
        ok: true,
        summary: { changed: result.changed },
        data: {
          changed: result.changed,
          status: result.status,
          statusLabel: FULFILLMENT_LABELS[result.status],
          activityId: result.activityId,
          ...(result.cancellation ? { cancellation: result.cancellation } : {}),
          url: orderUrl(issuer, parsed.orderId),
          message: result.changed
            ? `Stav objednávky nastaven na „${FULFILLMENT_LABELS[result.status]}“.`
            : `Stav objednávky už byl „${FULFILLMENT_LABELS[result.status]}“ — nic se nezapsalo znovu.`,
        },
      };
    },
  }),
];
