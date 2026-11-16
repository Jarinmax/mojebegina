// EKONOMIKA 1.0 — nástroje asistenta pro příjmy a náklady (economy_entries).
// Jen pro Jaroslava a Lucii (isInvoiceIssuer); zápis jen se souhlasem
// mojebegina.invoicing (finance), stejně jako fakturace.
import "server-only";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { economyEntries } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { parseAmountToHal, parseEntryDate, PAYMENT_FORMS } from "@/lib/ekonomika/economy";
import { ArgError, idempotencyKey, optionalString, requiredString } from "../args";
import { defineTool, type AgentTool } from "../define";

const DENIED = `Ekonomiku smí číst a zapisovat jen ${INVOICE_ISSUER_NAMES}.`;
const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);
const ECONOMY_URL = "https://moje.begina.cz/rizeni-firmy/ekonomika";

function kindOf(args: Record<string, unknown>): "income" | "cost" {
  if (args.kind === "cost" || args.kind === "income") return args.kind;
  throw new ArgError("Argument kind musí být cost (náklad) nebo income (příjem).");
}

function monthOf(args: Record<string, unknown>): { from: string; to: string; label: string } {
  const raw = requiredString(args, "month", 7);
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new ArgError("Argument month musí být ve tvaru RRRR-MM, např. 2026-11.");
  const year = Number(match[1]);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { from: `${raw}-01`, to: next, label: raw };
}

export const ECONOMY_TOOLS: AgentTool[] = [
  defineTool({
    name: "economy_list_entries",
    title: "Ekonomika — příjmy nebo náklady za měsíc",
    description:
      "JEN ČTENÍ — vypíše zapsané náklady (kind=cost) nebo příjmy (kind=income) z Ekonomiky v MojeBegina za jeden měsíc (month=RRRR-MM) se součtem. Před zápisem nového řádku tím ověř, že tam už není (stejné datum, částka a prodávající). Údaje jsou důvěrné — jen pro Jaroslava a Lucii.",
    write: false,
    visible: issuerOnly,
    properties: {
      kind: { type: "string", enum: ["cost", "income"], description: "cost = náklady, income = příjmy." },
      month: { type: "string", description: "Měsíc RRRR-MM, např. 2026-11." },
    },
    required: ["kind", "month"],
    parse: (args) => ({ kind: kindOf(args), month: monthOf(args) }),
    execute: async ({ kind, month }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const rows = await db
        .select()
        .from(economyEntries)
        .where(and(eq(economyEntries.kind, kind), isNull(economyEntries.deletedAt), gte(economyEntries.entryDate, month.from), lt(economyEntries.entryDate, month.to)))
        .orderBy(asc(economyEntries.entryDate), asc(economyEntries.createdAt));
      const totalHal = rows.reduce((sum, row) => sum + row.amountHal, 0);
      return {
        ok: true,
        summary: { count: rows.length },
        data: {
          kind,
          month: month.label,
          count: rows.length,
          totalKc: totalHal / 100,
          truncated: rows.length > 300,
          entries: rows.slice(0, 300).map((row) => ({
            date: row.entryDate,
            title: row.title,
            counterparty: row.counterparty,
            amountKc: row.amountHal / 100,
            paymentForm: row.paymentForm,
            invoiceNumber: row.invoiceNumber,
            note: row.note,
            source: row.source,
          })),
          url: ECONOMY_URL,
        },
      };
    },
  }),
  defineTool({
    name: "economy_add_entry",
    title: "Ekonomika — zapsat náklad nebo příjem",
    description:
      "ZÁPIS — přidá jeden řádek do Ekonomiky v MojeBegina: náklad (kind=cost: co se kupovalo, prodávající) nebo příjem (kind=income: typ, klient, forma úhrady, číslo faktury). Zapisuj jen údaje z dokladu nebo od uživatele, nic neodhaduj; částka je celková v Kč. Nejdřív přes economy_list_entries ověř, že řádek ještě neexistuje. Volej až po souhlasu uživatele s tím, co zapíšeš. Existující řádky nemění ani nemaže.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      kind: { type: "string", enum: ["cost", "income"], description: "cost = náklad, income = příjem." },
      date: { type: "string", description: "Datum dokladu RRRR-MM-DD." },
      title: { type: "string", description: "Náklad: co se kupovalo (např. „Zboží do bistra“). Příjem: typ (např. „Faktura“, „Tržby bistro“)." },
      counterparty: { type: "string", description: "Náklad: prodávající. Příjem: klient." },
      amount_kc: { type: "number", description: "Celková částka v Kč (kladná, nejvýš na haléře)." },
      amount_no_shipping_kc: { type: "number", description: "Jen příjem: cena bez dopravy v Kč (nepovinné)." },
      payment_form: { type: "string", description: `Jen příjem: forma úhrady (${PAYMENT_FORMS.join(", ")}; nepovinné).` },
      invoice_number: { type: "string", description: "Jen příjem: číslo faktury (nepovinné)." },
      note: { type: "string", description: "Poznámka, např. „není faktura“ (nepovinné)." },
    },
    required: ["kind", "date", "title", "amount_kc"],
    parse: (args) => {
      const kind = kindOf(args);
      const entryDate = parseEntryDate(requiredString(args, "date", 10));
      if (!entryDate) throw new ArgError("Argument date musí být platné datum RRRR-MM-DD.");
      const amountHal = parseAmountToHal(String(args.amount_kc ?? ""));
      if (amountHal === null) throw new ArgError("Argument amount_kc musí být kladná částka v Kč.");
      const rawNoShipping = args.amount_no_shipping_kc;
      const amountNoShippingHal = rawNoShipping === undefined || rawNoShipping === null ? null : parseAmountToHal(String(rawNoShipping));
      if (rawNoShipping !== undefined && rawNoShipping !== null && amountNoShippingHal === null) throw new ArgError("Argument amount_no_shipping_kc musí být kladná částka v Kč.");
      if (kind === "cost" && (amountNoShippingHal !== null || args.payment_form || args.invoice_number)) {
        throw new ArgError("U nákladu se nevyplňuje cena bez dopravy, forma úhrady ani číslo faktury — patří do poznámky.");
      }
      return {
        kind,
        entryDate,
        title: requiredString(args, "title", 300),
        counterparty: optionalString(args, "counterparty", 300),
        amountHal,
        amountNoShippingHal,
        paymentForm: optionalString(args, "payment_form", 60),
        invoiceNumber: optionalString(args, "invoice_number", 40),
        note: optionalString(args, "note", 500),
        key: idempotencyKey(args),
      };
    },
    execute: async ({ key, ...entry }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const inserted = await db
        .insert(economyEntries)
        .values({ ...entry, source: "agent", sourceRef: key, createdByUserId: ctx.userId })
        .onConflictDoNothing({ target: [economyEntries.source, economyEntries.sourceRef] })
        .returning({ id: economyEntries.id });
      return {
        ok: true,
        summary: { created: inserted.length > 0 },
        data: {
          created: inserted.length > 0,
          message: inserted.length > 0 ? `${entry.kind === "cost" ? "Náklad" : "Příjem"} ${entry.amountHal / 100} Kč (${entry.entryDate}, ${entry.title}) je zapsaný.` : "Tento zápis už dřív proběhl (stejný idempotency_key) — nic se nezapsalo podruhé.",
          url: ECONOMY_URL,
        },
      };
    },
  }),
];
