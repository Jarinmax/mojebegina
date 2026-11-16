// Legislativní audit — druhy reportů (sdílí stránka, datová vrstva i MCP nástroje).
export const LEGAL_AUDIT_KINDS = ["mesicni", "upozorneni", "mimoradny"] as const;
export type LegalAuditKind = (typeof LEGAL_AUDIT_KINDS)[number];

export const LEGAL_AUDIT_KIND_LABELS: Record<LegalAuditKind, string> = {
  mesicni: "Měsíční report",
  upozorneni: "Upozornění na změnu",
  mimoradny: "Mimořádná analýza",
};

export const LEGAL_AUDIT_NAME = "Legislativní audit";
export const LEGAL_AUDIT_PATH = "/rizeni-firmy/legislativni-audit";
export const LEGAL_AUDIT_BODY_MAX = 60_000;
