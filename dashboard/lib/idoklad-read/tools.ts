// Čtení iDokladu — katalog nástrojů a JEDINÝ vstup (runIdokladRead) pro
// všechny kanály: UI MojeBegina ("ui") i asistenty přes MCP ("mcp:chatgpt",
// "mcp:claude"). Každé volání projde stejnými kroky:
//
//   1. kontrola argumentů (neplatné = „invalid“, do iDokladu nic),
//   2. oprávnění: přihlášená osoba z getAuthContext() musí být vystavovatel
//      faktur (invoiceAuth.ts: Jaroslav Viner, Lucie Königsbergová s aktivní
//      rolí) — u MCP je to uživatel, který asistentovi udělil OAuth souhlas,
//   3. kanál: asistent jen když je výslovně povolený v IDOKLAD_READ_CHANNELS
//      (výchozí žádný); UI vždy,
//   4. limit: nejvýš READ_LIMIT_PER_MINUTE / READ_LIMIT_PER_HOUR volání
//      na osobu (ochrana API limitů iDokladu),
//   5. auditní záznam PŘED čtením (idoklad_read_log) — když se nezapíše,
//      nic se nečte; po čtení se doplní výsledek,
//   6. čtení přes klienta BEZ práva zápisu (přístupové údaje jen na serveru,
//      do odpovědi ani do logu se nedostanou).
import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { idokladReadLog } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError } from "@/lib/eshop/invoicing/idokladHttp";
import { eshopIdokladCredentials } from "@/lib/eshop/invoicing/mode";
import {
  ReadInputError,
  getInvoice,
  listSeriesStatus,
  numberingAudit,
  searchInvoices,
  unpaidAndDiscrepancies,
  type IdokladReader,
  type MojeBeginaInvoice,
} from "./service";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;
type Args = Record<string, unknown>;

export const READ_LIMIT_PER_MINUTE = 20;
export const READ_LIMIT_PER_HOUR = 300;
/** Strop požadavků na iDoklad za jedno volání (denní kvóta API). */
export const READ_REQUEST_BUDGET = 60;

export type ReadChannel = "ui" | `mcp:${string}`;

export type ReadOutcome =
  | { ok: true; data: Record<string, unknown>; summary: Record<string, number | boolean> }
  | { ok: false; status: "invalid" | "denied" | "rate_limited" | "error" | "unavailable"; error: string };

// ------------------------------------------------------------------ argumenty

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(args: Args, key: string, max: number, pattern?: RegExp): string | null {
  const value = args[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ReadInputError(`${key}: čekám text.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) throw new ReadInputError(`${key}: nejvýš ${max} znaků.`);
  if (pattern && !pattern.test(trimmed)) throw new ReadInputError(`${key}: neplatný tvar „${trimmed}“.`);
  return trimmed;
}

function bool(args: Args, key: string): boolean {
  const value = args[key];
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") throw new ReadInputError(`${key}: čekám true/false.`);
  return value;
}

function int(args: Args, key: string, min: number, max: number): number | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ReadInputError(`${key}: celé číslo ${min}–${max}.`);
  }
  return value;
}

function only(args: Args, allowed: string[]) {
  const extra = Object.keys(args).filter((k) => !allowed.includes(k));
  if (extra.length) throw new ReadInputError(`Neznámé parametry: ${extra.join(", ")}.`);
}

/** Argumenty do auditu: bez osobních údajů (jméno zákazníka jen délka). */
export function auditArgs(args: Args): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "customer") out.customer_length = typeof value === "string" ? value.trim().length : null;
    else if (["number", "variable_symbol", "ico", "date_from", "date_to", "year", "unpaid_only", "limit", "id"].includes(key)) out[key] = value;
    else if (key === "numbers" && Array.isArray(value)) out.numbers = value.slice(0, 20);
    else out[key] = "[vynecháno]";
  }
  return out;
}

// ------------------------------------------------------------------ nástroje

type Deps = { client: IdokladReader; db: Db; now: Date };

export type IdokladReadTool = {
  name: string;
  title: string;
  description: string;
  properties: Record<string, unknown>;
  required: string[];
  parse(args: Args): unknown;
  run(parsed: unknown, deps: Deps): Promise<{ data: Record<string, unknown>; count: number; summary?: Record<string, number | boolean> }>;
};

function tool<P>(t: Omit<IdokladReadTool, "parse" | "run"> & { parse(args: Args): P; run(parsed: P, deps: Deps): ReturnType<IdokladReadTool["run"]> }): IdokladReadTool {
  return t as IdokladReadTool;
}

const PERIOD = "YYYY-MM-DD (kalendářní den, datum vystavení faktury)";

async function mojeBeginaInvoices(db: Db): Promise<MojeBeginaInvoice[]> {
  const rows = (
    await db.execute(sql`
      SELECT i.invoice_number AS number, i.total_kc, (i.paid_at IS NOT NULL) AS paid, i.order_id
      FROM invoices i JOIN invoice_provider_links l ON l.invoice_id = i.id
      WHERE l.provider = 'idoklad' AND l.external_id IS NOT NULL AND i.doc_state = 'issued' AND i.invoice_number IS NOT NULL`)
  ).rows as { number: string; total_kc: number; paid: boolean; order_id: string }[];
  return rows.map((r) => ({ number: r.number, totalKc: Number(r.total_kc), paid: r.paid, orderUrlPath: `/rizeni-firmy/objednavky/${r.order_id}` }));
}

export const IDOKLAD_READ_TOOLS: IdokladReadTool[] = [
  tool({
    name: "idoklad_search_invoices",
    title: "iDoklad: hledat vydané faktury",
    description:
      "Vyhledá vydané faktury v iDokladu agendy Begina (jen čtení). Podle čísla faktury, IČO odběratele, nebo v období (date_from, nejvýš 366 dní) " +
      "podle variabilního symbolu či části názvu/jména odběratele; volitelně jen neuhrazené. iDoklad neumí filtrovat podle VS a jména — " +
      "prochází se období (nejvýš 1000 faktur), proto u VS a zákazníka uveď období. Vrací souhrn: číslo, řadu, odběratele (název, IČO, obec), " +
      "částku, stav úhrady, data vystavení / DUZP / splatnosti / úhrady (null = nevyplněno) a vytvoření v pražském čase.",
    properties: {
      number: { type: "string", description: "Číslo faktury, např. „9260001“ nebo „20260192“." },
      variable_symbol: { type: "string", description: "Variabilní symbol (jen s date_from)." },
      ico: { type: "string", description: "IČO odběratele (8 číslic)." },
      customer: { type: "string", description: "Část názvu firmy / jména odběratele (jen s date_from), bez diakritiky stačí." },
      date_from: { type: "string", description: `Od ${PERIOD}` },
      date_to: { type: "string", description: `Do (včetně) ${PERIOD}` },
      unpaid_only: { type: "boolean", description: "Jen neuhrazené / částečně uhrazené." },
      limit: { type: "integer", description: "Nejvýš faktur ve výsledku (1–100, výchozí 50)." },
    },
    required: [],
    parse: (args) => {
      only(args, ["number", "variable_symbol", "ico", "customer", "date_from", "date_to", "unpaid_only", "limit"]);
      return {
        number: str(args, "number", 20, /^[0-9A-Za-z/-]+$/),
        variableSymbol: str(args, "variable_symbol", 10, /^\d+$/),
        ico: str(args, "ico", 8, /^\d{8}$/),
        customer: str(args, "customer", 100),
        dateFrom: str(args, "date_from", 10, DATE),
        dateTo: str(args, "date_to", 10, DATE),
        unpaidOnly: bool(args, "unpaid_only"),
        limit: int(args, "limit", 1, 100) ?? undefined,
      };
    },
    run: async (input, { client, now }) => {
      const result = await searchInvoices(client, input, now);
      return { data: result as unknown as Record<string, unknown>, count: result.invoices.length, summary: { found: result.invoices.length, truncated: result.truncated } };
    },
  }),
  tool({
    name: "idoklad_get_invoice",
    title: "iDoklad: detail vydané faktury",
    description:
      "Detail jedné vydané faktury z iDokladu (jen čtení): číslo, číselná řada (ověřená v iDokladu), odběratel (název, IČO, DIČ; u firmy sídlo, " +
      "u osoby jen obec — bez e-mailu a telefonu), položky, částka a uhrazeno, stav úhrady, datum vystavení, DUZP, splatnosti, úhrady (null = nevyplněno, " +
      "iDoklad posílá 1753-01-01), vytvoření a poslední změna v iDokladu v pražském čase a o kolik dní po datu vystavení doklad vznikl.",
    properties: {
      number: { type: "string", description: "Číslo faktury, např. „9260001“." },
      id: { type: "integer", description: "ID faktury v iDokladu (když číslo není jednoznačné)." },
    },
    required: [],
    parse: (args) => {
      only(args, ["number", "id"]);
      const parsed = { number: str(args, "number", 20, /^[0-9A-Za-z/-]+$/), id: int(args, "id", 1, 2_000_000_000) };
      if (!parsed.number && !parsed.id) throw new ReadInputError("Zadejte number nebo id.");
      return parsed;
    },
    run: async (input, { client, now }) => {
      const invoice = await getInvoice(client, input, now);
      if (!invoice) return { data: { found: false, invoice: null }, count: 0, summary: { found: false } };
      return { data: { found: true, invoice }, count: 1, summary: { found: true } };
    },
  }),
  tool({
    name: "idoklad_list_series",
    title: "iDoklad: číselné řady vydaných faktur",
    description:
      "Seznam číselných řad vydaných faktur v iDokladu (název, ID, výchozí, formát) a za zvolený rok počet dokladů, první a poslední číslo; " +
      "kontrola číslování — duplicitní čísla (i napříč řadami) a mezery v pořadí. Datování (zpětně vystavené doklady) je v idoklad_numbering_audit.",
    properties: { year: { type: "string", description: "Rok, např. „2026“." } },
    required: ["year"],
    parse: (args) => {
      only(args, ["year"]);
      return { year: str(args, "year", 4, /^20\d{2}$/)! };
    },
    run: async (input, { client, now }) => {
      const result = await listSeriesStatus(client, input.year, now);
      if (!result.ok) throw new ReadInputError(result.error ?? "Číselné řady se nepodařilo načíst.");
      return { data: result as unknown as Record<string, unknown>, count: result.series.length, summary: { series: result.series.length, numberingFindings: result.numbering.length } };
    },
  }),
  tool({
    name: "idoklad_numbering_audit",
    title: "iDoklad: audit číslování a datování",
    description:
      "Úplný audit vydaných faktur za rok (jen čtení): po řadách duplicity, mezery, obrácené pořadí dat, číslo přidělené mimo pořadí vzniku " +
      "a doklady vytvořené v iDokladu později, než je jejich datum vystavení (porovnání v pražském čase). U vybraných čísel řada, data, " +
      "vytvoření a poslední změna. Úroveň: error = chyba číslování, warning = k vysvětlení, info = přípustné. Neříká, zda je zpětné datum " +
      "účetně v pořádku — to posoudí odpovědná osoba.",
    properties: {
      year: { type: "string", description: "Rok, např. „2026“." },
      numbers: { type: "array", items: { type: "string" }, description: "Čísla faktur k podrobnému výpisu (nejvýš 20)." },
    },
    required: ["year"],
    parse: (args) => {
      only(args, ["year", "numbers"]);
      const numbers = args.numbers ?? [];
      if (!Array.isArray(numbers) || numbers.length > 20 || !numbers.every((n) => typeof n === "string" && /^\d{4,12}$/.test(n))) {
        throw new ReadInputError("numbers: nejvýš 20 čísel faktur (jen číslice).");
      }
      return { year: str(args, "year", 4, /^20\d{2}$/)!, numbers: numbers as string[] };
    },
    run: async (input, { client, now }) => {
      const result = await numberingAudit(client, input, now);
      if (!result.ok) throw new ReadInputError(result.error ?? "Audit se nedokončil.");
      // průběh požadavků (requests) se asistentům nevrací — jen počet
      const data: Record<string, unknown> = { ...result };
      delete data.requests;
      return {
        data,
        count: result.findings.length,
        summary: {
          errors: result.findings.filter((f) => f.level === "error").length,
          warnings: result.findings.filter((f) => f.level === "warning").length,
        },
      };
    },
  }),
  tool({
    name: "idoklad_unpaid_and_discrepancies",
    title: "iDoklad: neuhrazené faktury a nesrovnalosti",
    description:
      "Neuhrazené a částečně uhrazené vydané faktury od date_from (nejvýš 366 dní; po splatnosti první) a nesrovnalosti: částečná úhrada, " +
      "přeplatek, datum úhrady u neuhrazené, vystaveno zpětně (vytvořeno později než datum vystavení, pražský čas) a nesoulad faktur " +
      "vystavených z MojeBegina s iDokladem (chybí, jiná částka, jinak uhrazeno). Jen čtení.",
    properties: { date_from: { type: "string", description: `Od ${PERIOD}` } },
    required: ["date_from"],
    parse: (args) => {
      only(args, ["date_from"]);
      return { dateFrom: str(args, "date_from", 10, DATE)! };
    },
    run: async (input, { client, db, now }) => {
      const result = await unpaidAndDiscrepancies(client, { dateFrom: input.dateFrom, mojeBegina: await mojeBeginaInvoices(db) }, now);
      return {
        data: result as unknown as Record<string, unknown>,
        count: result.unpaid.length,
        summary: { unpaid: result.unpaid.length, discrepancies: result.discrepancies.length, truncated: result.truncated },
      };
    },
  }),
];

export function findIdokladReadTool(name: string): IdokladReadTool | null {
  return IDOKLAD_READ_TOOLS.find((t) => t.name === name) ?? null;
}

// ------------------------------------------------------------------ přístup

/** Povolené kanály asistentů (IDOKLAD_READ_CHANNELS="mcp:chatgpt,mcp:claude"); UI vždy. */
export function channelAllowed(channel: ReadChannel, env: Env = process.env): boolean {
  if (channel === "ui") return true;
  if (!/^mcp:[a-z0-9_-]{1,40}$/.test(channel)) return false;
  const allowed = (env.IDOKLAD_READ_CHANNELS ?? "")
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  return allowed.includes(channel);
}

async function recentCalls(db: Db, userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(idokladReadLog)
    .where(and(eq(idokladReadLog.userId, userId), gt(idokladReadLog.createdAt, since)));
  return Number(row?.n ?? 0);
}

function errorText(error: unknown): string {
  if (error instanceof ReadInputError || error instanceof IdokladApiError || error instanceof IdokladBlockedError) return error.message;
  return "Neočekávaná chyba při čtení iDokladu.";
}

export type RunDeps = {
  db?: Db;
  env?: Env;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** jen testy: identita bez Neon Auth */
  authContext?: Awaited<ReturnType<typeof getAuthContext>>;
};

/**
 * Jediný vstup ke čtení iDokladu. Vrací strukturovaný výsledek; nikdy
 * nevyhazuje výjimku a nikdy neobsahuje přístupové údaje ani token.
 */
export async function runIdokladRead(name: string, rawArgs: unknown, channel: ReadChannel, deps: RunDeps = {}): Promise<ReadOutcome> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const db = deps.db ?? (await import("@/lib/db/client")).db;
  const ctx = deps.authContext !== undefined ? deps.authContext : await getAuthContext();
  const userId = ctx?.userId ?? "anonymous";
  const args: Args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? (rawArgs as Args) : {};
  const t = findIdokladReadTool(name);
  const log = (status: string, extra: Partial<typeof idokladReadLog.$inferInsert> = {}) =>
    db.insert(idokladReadLog).values({ userId, channel, tool: t?.name ?? "unknown", args: auditArgs(args), status, ...extra }).returning({ id: idokladReadLog.id });

  // kanál a oprávnění (zápis odmítnutí do auditu, když to jde)
  const deny = async (status: "denied" | "rate_limited" | "invalid", error: string): Promise<ReadOutcome> => {
    await log(status, { error: error.slice(0, 300) }).catch(() => undefined);
    return { ok: false, status, error };
  };
  if (!t) return deny("invalid", `Neznámý nástroj ${name}.`);
  if (!channelAllowed(channel, env)) return deny("denied", `Kanál ${channel} nemá povolené čtení iDokladu.`);
  if (!isInvoiceIssuer(ctx ?? null)) return deny("denied", `Údaje z iDokladu smí číst jen ${INVOICE_ISSUER_NAMES}.`);

  let parsed: unknown;
  try {
    parsed = t.parse(args);
  } catch (error) {
    return deny("invalid", errorText(error));
  }

  const credentials = eshopIdokladCredentials(env);
  if (!credentials) return { ok: false, status: "unavailable", error: "iDoklad není na tomto prostředí připojený (chybí přístupové údaje na serveru)." };

  let started: { id: string };
  try {
    const minute = await recentCalls(db, userId, new Date(now.getTime() - 60_000));
    const hour = await recentCalls(db, userId, new Date(now.getTime() - 3_600_000));
    if (minute >= READ_LIMIT_PER_MINUTE || hour >= READ_LIMIT_PER_HOUR) {
      return deny("rate_limited", `Limit čtení iDokladu: nejvýš ${READ_LIMIT_PER_MINUTE} za minutu a ${READ_LIMIT_PER_HOUR} za hodinu. Zkuste to později.`);
    }
    [started] = await log("started");
  } catch {
    // bez auditního záznamu se nečte
    return { ok: false, status: "unavailable", error: "Auditní záznam se nepodařilo zapsat — čtení iDokladu je zablokované." };
  }

  const client = new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl: deps.fetchImpl, requestBudget: READ_REQUEST_BUDGET });
  const reader: IdokladReader = client;
  const startedAt = Date.now();
  try {
    const result = await t.run(parsed, { client: reader, db, now });
    await db
      .update(idokladReadLog)
      .set({ status: "ok", resultCount: result.count, idokladRequests: client.requestCount, durationMs: Date.now() - startedAt })
      .where(eq(idokladReadLog.id, started.id));
    return { ok: true, data: { ...result.data, source: { system: "iDoklad", agenda: "Begina", readAt: now.toISOString(), readOnly: true } }, summary: result.summary ?? {} };
  } catch (error) {
    const message = errorText(error);
    if (!(error instanceof ReadInputError || error instanceof IdokladApiError || error instanceof IdokladBlockedError)) {
      console.error("Čtení iDokladu selhalo", t.name, error instanceof Error ? error.message : error);
    }
    await db
      .update(idokladReadLog)
      .set({ status: "error", error: message.slice(0, 300), idokladRequests: client.requestCount, durationMs: Date.now() - startedAt })
      .where(eq(idokladReadLog.id, started.id))
      .catch(() => undefined);
    return { ok: false, status: "error", error: message };
  }
}
