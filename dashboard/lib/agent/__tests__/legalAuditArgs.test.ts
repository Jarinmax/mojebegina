// Legislativní audit — kontrola argumentů MCP nástrojů (bez DB).
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/legalAudit", () => ({ getLegalAuditReport: vi.fn(), listLegalAuditReports: vi.fn(), saveLegalAuditReport: vi.fn(), LEGAL_AUDIT_DENIED: "x" }));
vi.mock("@/lib/data/authContext", () => ({ getAuthContext: vi.fn() }));

const { LEGAL_AUDIT_TOOLS, parseKind, parseReportDate, parseUrgentCount } = await import("../mcp/tools/legalAudit");

describe("legal_audit nástroje — argumenty", () => {
  it("datum RRRR-MM-DD, jen platné", () => {
    expect(parseReportDate("2026-11-17")).toBe("2026-11-17");
    expect(() => parseReportDate("2026-02-30")).toThrow();
    expect(() => parseReportDate("17.11.2026")).toThrow();
  });
  it("druh jen z povoleného seznamu", () => {
    expect(parseKind("mesicni")).toBe("mesicni");
    expect(() => parseKind("jiny")).toThrow();
  });
  it("počet naléhavých bodů", () => {
    expect(parseUrgentCount(undefined)).toBe(0);
    expect(parseUrgentCount(3)).toBe(3);
    expect(() => parseUrgentCount(-1)).toThrow();
    expect(() => parseUrgentCount(1.5)).toThrow();
  });
  it("uložení je zápis s idempotency_key, seznam je jen čtení", () => {
    const save = LEGAL_AUDIT_TOOLS.find((t) => t.definition.name === "legal_audit_save_report")!;
    const list = LEGAL_AUDIT_TOOLS.find((t) => t.definition.name === "legal_audit_list_reports")!;
    expect(save.write).toBe(true);
    expect(list.write).toBe(false);
    expect(() => save.parse({ report_date: "2026-11-17", kind: "mimoradny", title: "T", body: "B" })).toThrow();
    expect(save.parse({ report_date: "2026-11-17", kind: "mimoradny", title: "T", body: "B", idempotency_key: "klic-0001" })).toMatchObject({ kind: "mimoradny", urgentCount: 0, key: "klic-0001" });
  });
});
