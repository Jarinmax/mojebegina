// LEGISLATIVNÍ AUDIT 1.0 — nástroje asistenta: uložit právní report do
// Řízení firmy → Legislativní audit a vypsat/přečíst uložené reporty.
// Jen pro Jaroslava a Lucii (isInvoiceIssuer). Nic nepřepisuje ani nemaže.
import "server-only";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { getLegalAuditReport, LEGAL_AUDIT_DENIED, listLegalAuditReports, saveLegalAuditReport } from "@/lib/data/legalAudit";
import { LEGAL_AUDIT_BODY_MAX, LEGAL_AUDIT_KINDS, LEGAL_AUDIT_PATH, type LegalAuditKind } from "@/lib/legislativniAudit/kinds";
import { ArgError, idempotencyKey, optionalString, requiredString, requiredUuid } from "../args";
import { defineTool, type AgentTool } from "../define";

const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);
const reportUrl = (issuer: string, id: string) => `${issuer}${LEGAL_AUDIT_PATH}?id=${id}`;

export function parseReportDate(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = match ? new Date(`${raw}T00:00:00Z`) : null;
  if (!match || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new ArgError("Argument report_date musí být platné datum RRRR-MM-DD.");
  }
  return raw;
}

export function parseKind(value: unknown): LegalAuditKind {
  if (typeof value === "string" && (LEGAL_AUDIT_KINDS as readonly string[]).includes(value)) return value as LegalAuditKind;
  throw new ArgError(`Argument kind musí být jedna z hodnot: ${LEGAL_AUDIT_KINDS.join(", ")}.`);
}

export function parseUrgentCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999) {
    throw new ArgError("Argument urgent_count musí být celé číslo 0–999.");
  }
  return value;
}

export const LEGAL_AUDIT_TOOLS: AgentTool[] = [
  defineTool({
    name: "legal_audit_save_report",
    title: "Legislativní audit — uložit report",
    description:
      "ZÁPIS — uloží právní report (hlídání zákonů ČR/SR/EU, kontrola webu begina.cz) do Řízení firmy → Legislativní audit. kind: mesicni (měsíční report), upozorneni (průběžné upozornění na změnu), mimoradny (jednorázová analýza). body = celý text reportu (prostý text nebo Markdown, max. 60 000 znaků). Uložený report se nepřepisuje ani nemaže; opravu ulož jako nový report. Jen Jaroslav a Lucie.",
    write: true,
    visible: issuerOnly,
    properties: {
      report_date: { type: "string", description: "Datum reportu RRRR-MM-DD." },
      kind: { type: "string", enum: [...LEGAL_AUDIT_KINDS], description: "Druh reportu." },
      title: { type: "string", description: "Název (max. 200 znaků), např. „Legislativa – měsíční report prosinec 2026“." },
      summary: { type: "string", description: "Shrnutí ve 2–5 větách (max. 1500 znaků)." },
      body: { type: "string", description: "Celý text reportu (max. 60 000 znaků)." },
      urgent_count: { type: "integer", description: "Počet naléhavých bodů (výchozí 0)." },
    },
    required: ["report_date", "kind", "title", "body"],
    parse: (args) => ({
      reportDate: parseReportDate(requiredString(args, "report_date", 10)),
      kind: parseKind(args.kind),
      title: requiredString(args, "title", 200),
      summary: optionalString(args, "summary", 1500),
      body: requiredString(args, "body", LEGAL_AUDIT_BODY_MAX),
      urgentCount: parseUrgentCount(args.urgent_count),
      key: idempotencyKey(args),
    }),
    execute: async (input, issuer) => {
      const result = await saveLegalAuditReport(input);
      if (!result.ok) return { ok: false, error: result.error };
      const { id, created } = result.data;
      return {
        ok: true,
        summary: { created },
        data: {
          created,
          message: created ? `Report „${input.title}“ je uložený v Legislativním auditu.` : "Tento zápis už dřív proběhl (stejný idempotency_key) — nic se neuložilo podruhé.",
          url: id ? reportUrl(issuer, id) : `${issuer}${LEGAL_AUDIT_PATH}`,
        },
      };
    },
  }),
  defineTool({
    name: "legal_audit_list_reports",
    title: "Legislativní audit — seznam reportů",
    description:
      "JEN ČTENÍ — vypíše uložené reporty Legislativního auditu (datum, druh, název, shrnutí, počet naléhavých bodů), nejnovější první. S report_id vrátí celý text jednoho reportu. Použij před novým reportem, abys neopakoval, co už bylo nahlášeno.",
    write: false,
    visible: issuerOnly,
    properties: {
      report_id: { type: "string", description: "id reportu (UUID) — nepovinné; když je vyplněné, vrátí celý text." },
      limit: { type: "integer", description: "Kolik reportů vypsat (1–100, výchozí 30)." },
    },
    required: [],
    parse: (args) => {
      const reportId = args.report_id === undefined || args.report_id === null || args.report_id === "" ? null : requiredUuid(args, "report_id");
      const raw = args.limit;
      if (raw !== undefined && raw !== null && (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 100)) {
        throw new ArgError("Argument limit musí být celé číslo 1–100.");
      }
      return { reportId, limit: typeof raw === "number" ? raw : 30 };
    },
    execute: async ({ reportId, limit }, issuer) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: LEGAL_AUDIT_DENIED };
      if (reportId) {
        const result = await getLegalAuditReport(reportId);
        if (!result.ok) return { ok: false, error: result.error };
        if (!result.data) return { ok: false, error: "Report s tímto id neexistuje." };
        const row = result.data;
        return {
          ok: true,
          data: { id: row.id, reportDate: row.reportDate, kind: row.kind, title: row.title, summary: row.summary, urgentCount: row.urgentCount, body: row.body, url: reportUrl(issuer, row.id) },
        };
      }
      const result = await listLegalAuditReports(limit);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        summary: { count: result.data.length },
        data: {
          count: result.data.length,
          reports: result.data.map((row) => ({ id: row.id, reportDate: row.reportDate, kind: row.kind, title: row.title, summary: row.summary, urgentCount: row.urgentCount, url: reportUrl(issuer, row.id) })),
          url: `${issuer}${LEGAL_AUDIT_PATH}`,
        },
      };
    },
  }),
];
