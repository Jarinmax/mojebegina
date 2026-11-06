// Audit číslování vydaných faktur v iDokladu — JEN ČTENÍ.
//
// Pro účetní kontrolu dvou souběžných řad (od 20. 10. 2026): ruční řada
// Lucie (výchozí řada agendy, 2026xxxx) a E-shop Begina (7277293, 9RRNNNN).
// Zjistí pro každou řadu vydaných faktur: duplicitní čísla, mezery
// v pořadí, obrácenou chronologii (vyšší číslo s dřívějším datem
// vystavení), pořadí vytvoření a doklady s datem vystavení dřívějším než
// skutečné vytvoření v iDokladu (Metadata.DateCreated). U vybraných čísel
// vypíše řadu, data a historii vytvoření/změny.
//
// Volá výhradně GET (klient s writesAllowed: false — případný zápis by
// pojistka v idokladHttp.ts zablokovala před odesláním):
//   GET /Account/CurrentAgenda                            agenda Begina (IČO)
//   GET /NumericSequences?filter=DocumentType~eq~0        řady vydaných faktur
//   GET /IssuedInvoices?filter=NumericSequenceId~eq~…     doklady každé řady (po 100)
// Nic nezakládá, nemění ani neukládá; výsledek se jen zobrazí.
//
// Časy: Metadata.DateCreated vrací iDoklad v UTC — porovnává se s datem
// vystavení v PRAŽSKÉM čase (lib/idoklad-read/time.ts); 1753-01-01 =
// prázdné datum iDokladu (např. úhrada neuhrazené faktury) → null.
import { idokladDay, idokladUtc, pragueDateTime } from "@/lib/idoklad-read/time";
import { EshopIdokladClient, IdokladApiError, IdokladBlockedError, eqFilter, issuedInvoiceFilter, type IdokladLogEntry } from "./idokladHttp";
import { BEGINA_ICO, eshopIdokladCredentials, missingIdokladCredentials } from "./mode";
import { ISSUED_INVOICE_DOCUMENT_TYPE } from "./numberSeries";

/** Nejvýš tolik stran (po 100) dokladů jedné řady audit projde. */
export const AUDIT_PAGES_PER_SERIES = 20;

export type AuditDocument = {
  id: number;
  number: string;
  seriesId: number;
  seriesName: string;
  /** pořadí v roce (poslední 4 číslice čísla dokladu) */
  serial: number | null;
  /** YYYY-MM-DD */
  dateOfIssue: string | null;
  dateOfTaxing: string | null;
  dateOfPayment: string | null;
  dateOfMaturity: string | null;
  /** vytvoření / poslední změna v iDokladu, pražský čas „YYYY-MM-DD HH:mm:ss“ */
  created: string | null;
  lastChange: string | null;
  partner: string | null;
  variableSymbol: string | null;
  totalKc: number | null;
  paid: boolean | null;
};

export type AuditFinding = {
  /** error = skutečná chyba číslování; warning = k vysvětlení / potvrzení; info = přípustné, pro přehled */
  level: "error" | "warning" | "info";
  series: string;
  numbers: string[];
  message: string;
};

export type AuditSeries = {
  id: number;
  name: string;
  isDefault: boolean;
  format: string | null;
  /** doklady zvoleného roku v této řadě */
  count: number;
  first: string | null;
  last: string | null;
  truncated: boolean;
};

export type NumberingAuditResult = {
  ok: boolean;
  error: string | null;
  checkedAt: string;
  year: string;
  series: AuditSeries[];
  /** vybraná čísla (v zadaném pořadí); null = v žádné řadě vydaných faktur nenalezeno */
  focus: { number: string; document: AuditDocument | null }[];
  findings: AuditFinding[];
  requestCount: number;
  requests: IdokladLogEntry[];
};

type RawSequence = { Id: number; Name?: string | null; DocumentType?: number | string | null; IsDefault?: boolean | null; NumberFormat?: string | null };
type RawInvoice = {
  Id: number;
  DocumentNumber?: string | null;
  DocumentSerialNumber?: number | null;
  DateOfIssue?: string | null;
  DateOfTaxing?: string | null;
  DateOfPayment?: string | null;
  DateOfMaturity?: string | null;
  VariableSymbol?: string | null;
  PaymentStatus?: number | string | null;
  Prices?: { TotalWithVat?: number | null } | null;
  PartnerAddress?: { NickName?: string | null; Firstname?: string | null; Surname?: string | null } | null;
  Metadata?: { DateCreated?: string | null; DateLastChange?: string | null } | null;
};

const day = idokladDay;
const prague = (value: unknown): string | null => {
  const date = idokladUtc(value);
  return date ? pragueDateTime(date) : null;
};

function partnerName(raw: RawInvoice): string | null {
  const a = raw.PartnerAddress;
  if (!a) return null;
  return a.NickName?.trim() || [a.Firstname, a.Surname].filter(Boolean).join(" ").trim() || null;
}

export function toAuditDocument(raw: RawInvoice, series: { id: number; name: string }): AuditDocument {
  const number = (raw.DocumentNumber ?? "").trim();
  const tail = /(\d{4})$/.exec(number)?.[1];
  return {
    id: raw.Id,
    number,
    seriesId: series.id,
    seriesName: series.name,
    serial: tail ? Number(tail) : null,
    dateOfIssue: day(raw.DateOfIssue),
    dateOfTaxing: day(raw.DateOfTaxing),
    dateOfPayment: day(raw.DateOfPayment),
    dateOfMaturity: day(raw.DateOfMaturity),
    created: prague(raw.Metadata?.DateCreated),
    lastChange: prague(raw.Metadata?.DateLastChange),
    partner: partnerName(raw),
    variableSymbol: raw.VariableSymbol ?? null,
    totalKc: typeof raw.Prices?.TotalWithVat === "number" ? raw.Prices.TotalWithVat : null,
    paid: raw.PaymentStatus === 1 || raw.PaymentStatus === "Paid" ? true : raw.PaymentStatus == null ? null : false,
  };
}

/** Rozdíl dní a − b (YYYY-MM-DD). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Prefix čísla bez pořadí (2026 / 926) — doklady téhož roku a řady. */
function numberPrefix(number: string): string {
  return number.length > 4 ? number.slice(0, -4) : "";
}

/**
 * Čistá analýza jedné řady (doklady jednoho roku). Pořadí podle čísla.
 *   error   — stejné číslo vícekrát,
 *   warning — mezera v pořadí, vyšší číslo s dřívějším datem vystavení,
 *             datum vystavení dřívější než vytvoření v iDokladu (zpětně),
 *             vyšší číslo vytvořené dřív než nižší,
 *   info    — datum vystavení pozdější než vytvoření (předem vystavená).
 */
export function analyzeSeries(seriesLabel: string, documents: AuditDocument[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const counts = new Map<string, number>();
  for (const d of documents) counts.set(d.number, (counts.get(d.number) ?? 0) + 1);
  for (const [number, n] of counts) {
    if (n > 1) findings.push({ level: "error", series: seriesLabel, numbers: [number], message: `Číslo ${number} je v řadě ${n}×.` });
  }
  const unique = [...new Map(documents.map((d) => [d.number, d])).values()];
  const groups = new Map<string, AuditDocument[]>();
  for (const d of unique) {
    if (d.serial === null) {
      findings.push({ level: "warning", series: seriesLabel, numbers: [d.number], message: `Číslo „${d.number}“ nekončí čtyřmístným pořadím.` });
      continue;
    }
    const key = numberPrefix(d.number);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.serial! - b.serial!);
    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1];
      const cur = group[i];
      if (cur.serial! - prev.serial! > 1) {
        const missing = cur.serial! - prev.serial! - 1;
        findings.push({
          level: "warning",
          series: seriesLabel,
          numbers: [prev.number, cur.number],
          message: `Mezi ${prev.number} a ${cur.number} chybí ${missing} ${missing === 1 ? "číslo" : "čísel"} (smazaný nebo nevystavený doklad?).`,
        });
      }
      if (prev.dateOfIssue && cur.dateOfIssue && cur.dateOfIssue < prev.dateOfIssue) {
        findings.push({
          level: "warning",
          series: seriesLabel,
          numbers: [prev.number, cur.number],
          message: `${cur.number} má datum vystavení ${cur.dateOfIssue}, dřívější než předchozí ${prev.number} (${prev.dateOfIssue}).`,
        });
      }
      const prevCreated = prev.created ?? "";
      const curCreated = cur.created ?? "";
      if (prevCreated && curCreated && curCreated < prevCreated) {
        findings.push({
          level: "warning",
          series: seriesLabel,
          numbers: [prev.number, cur.number],
          message: `${cur.number} vznikl v iDokladu (${curCreated}) dřív než nižší ${prev.number} (${prevCreated}) — číslo přidělené mimo pořadí vzniku.`,
        });
      }
    }
  }
  for (const d of unique) {
    // d.created je už pražský čas → pražský den vytvoření
    const created = d.created ? d.created.slice(0, 10) : null;
    if (!created || !d.dateOfIssue) continue;
    const late = daysBetween(created, d.dateOfIssue);
    if (late > 0) {
      findings.push({
        level: "warning",
        series: seriesLabel,
        numbers: [d.number],
        message: `${d.number}: datum vystavení ${d.dateOfIssue}, ale v iDokladu vznikl až ${d.created} pražského času (o ${late} ${late === 1 ? "den" : late < 5 ? "dny" : "dní"} později).`,
      });
    } else if (late < 0) {
      findings.push({
        level: "info",
        series: seriesLabel,
        numbers: [d.number],
        message: `${d.number}: datum vystavení ${d.dateOfIssue} je po vytvoření (${d.created}).`,
      });
    }
  }
  return findings;
}

function message(error: unknown): string {
  if (error instanceof IdokladApiError || error instanceof IdokladBlockedError) return error.message;
  return `Neočekávaná chyba: ${error instanceof Error ? error.message : String(error)}`;
}

/** Audit nad klientem (jen čtení). Nikdy nevyhazuje výjimku. */
export async function runNumberingAudit(
  client: Pick<EshopIdokladClient, "get" | "list" | "requestCount" | "log">,
  options: { year: string; numbers: string[]; now?: Date }
): Promise<NumberingAuditResult> {
  const base = {
    checkedAt: (options.now ?? new Date()).toISOString(),
    year: options.year,
  };
  const finish = (partial: Omit<NumberingAuditResult, "checkedAt" | "year" | "requestCount" | "requests">): NumberingAuditResult => ({
    ...base,
    ...partial,
    requestCount: client.requestCount,
    requests: [...client.log],
  });
  const empty = { series: [], focus: options.numbers.map((number) => ({ number, document: null })), findings: [] };
  try {
    const agenda = await client.get<{ Contact?: { IdentificationNumber?: string | null } | null }>("/Account/CurrentAgenda");
    const ico = agenda?.Contact?.IdentificationNumber?.replace(/\s/g, "") ?? null;
    if (ico !== BEGINA_ICO) {
      return finish({ ok: false, error: `Přihlášená agenda má IČO ${ico ?? "neuvedeno"} — není to Begina.`, ...empty });
    }
    const sequences = (await client.list<RawSequence>("/NumericSequences", `DocumentType~eq~${ISSUED_INVOICE_DOCUMENT_TYPE}`)).Items.filter(
      (s) => s.DocumentType === undefined || s.DocumentType === null || s.DocumentType === ISSUED_INVOICE_DOCUMENT_TYPE || s.DocumentType === "IssuedInvoice"
    );
    const yy = options.year.slice(2);
    const series: AuditSeries[] = [];
    const findings: AuditFinding[] = [];
    const all: AuditDocument[] = [];
    for (const s of sequences) {
      const name = s.Name?.trim() || `řada ${s.Id}`;
      const docs: AuditDocument[] = [];
      let truncated = false;
      const filter = issuedInvoiceFilter(eqFilter("NumericSequenceId", String(s.Id)));
      for (let page = 1; page <= AUDIT_PAGES_PER_SERIES; page += 1) {
        const result = await client.list<RawInvoice>("/IssuedInvoices", filter, 100, page);
        docs.push(...result.Items.map((raw) => toAuditDocument(raw, { id: s.Id, name })));
        if (page >= result.TotalPages || result.Items.length === 0) break;
        if (page === AUDIT_PAGES_PER_SERIES) truncated = true;
      }
      all.push(...docs);
      // doklady zvoleného roku: prefix čísla končí rokem (2026xxxx, 926xxxx) nebo datum vystavení v roce
      const ofYear = docs.filter((d) => numberPrefix(d.number).endsWith(yy) || d.dateOfIssue?.startsWith(options.year));
      const label = `${name} (${s.Id})`;
      const sorted = [...ofYear].sort((a, b) => a.number.localeCompare(b.number, "cs", { numeric: true }));
      series.push({
        id: s.Id,
        name,
        isDefault: Boolean(s.IsDefault),
        format: s.NumberFormat ?? null,
        count: ofYear.length,
        first: sorted[0]?.number ?? null,
        last: sorted.at(-1)?.number ?? null,
        truncated,
      });
      if (truncated) {
        findings.push({ level: "warning", series: label, numbers: [], message: `Řada má víc než ${AUDIT_PAGES_PER_SERIES * 100} dokladů — audit není úplný.` });
      }
      findings.push(...analyzeSeries(label, ofYear));
    }
    // stejné číslo ve dvou řadách
    const bySeries = new Map<string, Set<number>>();
    for (const d of all) bySeries.set(d.number, (bySeries.get(d.number) ?? new Set()).add(d.seriesId));
    for (const [number, ids] of bySeries) {
      if (ids.size > 1) findings.push({ level: "error", series: "napříč řadami", numbers: [number], message: `Číslo ${number} je ve více řadách (${[...ids].join(", ")}).` });
    }
    const focus = options.numbers.map((number) => ({ number, document: all.find((d) => d.number === number) ?? null }));
    const order = { error: 0, warning: 1, info: 2 } as const;
    findings.sort((a, b) => order[a.level] - order[b.level]);
    return finish({ ok: true, error: null, series, focus, findings });
  } catch (error) {
    return finish({ ok: false, error: message(error), ...empty });
  }
}

/** Vybraná čísla z formuláře: jen číslice, nejvýš 20. */
export function parseAuditNumbers(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((n) => n.trim()).filter((n) => /^\d{4,12}$/.test(n)))].slice(0, 20);
}

/** Výchozí čísla k ověření (audit 22. 10. 2026). */
export const DEFAULT_AUDIT_NUMBERS = ["9260001", "20260190", "20260191", "20260192", "20260193", "20260194"];

/**
 * Spuštění z MojeBegina: stejné Client Credentials jako vystavení, klient
 * BEZ práva zápisu. Funguje nezávisle na přepínači fakturace.
 */
export async function runNumberingAuditFromEnv(
  input: { year: string; numbers: string[] },
  env: Record<string, string | undefined> = process.env,
  options: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<{ ok: true; result: NumberingAuditResult } | { ok: false; error: string }> {
  if (!/^20\d{2}$/.test(input.year)) return { ok: false, error: "Zadejte rok (např. 2026)." };
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) {
    return { ok: false, error: `Chybí přístupové údaje k iDokladu (${missingIdokladCredentials(env).join(", ")}) — audit nic nevolal.` };
  }
  const client = new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl: options.fetchImpl });
  return { ok: true, result: await runNumberingAudit(client, { ...input, now: options.now }) };
}
