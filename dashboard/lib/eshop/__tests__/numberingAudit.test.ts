// Audit číslování vydaných faktur v iDokladu (jen čtení) — dvě souběžné
// řady od 20. 10. 2026. Napodobenina iDokladu vrací doklady jako API v3
// (Metadata.DateCreated / DateLastChange, data jako DateTime).
import { describe, expect, it, vi } from "vitest";
import { analyzeSeries, parseAuditNumbers, runNumberingAuditFromEnv, toAuditDocument } from "../invoicing/numberingAudit";

const ENV = {
  VERCEL_ENV: "production",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "cid",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp",
};
const SEQUENCES = [
  { Id: 2032369, Name: "Výchozí", DocumentType: 0, IsDefault: true, NumberFormat: "{RRRR}{NNNN}" },
  { Id: 7277293, Name: "E-shop Begina", DocumentType: 0, IsDefault: false, NumberFormat: "9{RR}{NNNN}" },
];

type Doc = { seq: number; Id: number; DocumentNumber: string; issue: string; created: string; partner?: string; vs?: string; total?: number };
const inv = (d: Doc) => ({
  Id: d.Id,
  DocumentNumber: d.DocumentNumber,
  DateOfIssue: `${d.issue}T00:00:00`,
  DateOfTaxing: `${d.issue}T00:00:00`,
  DateOfPayment: `${d.issue}T00:00:00`,
  DateOfMaturity: `${d.issue}T00:00:00`,
  VariableSymbol: d.vs ?? d.DocumentNumber,
  PaymentStatus: 1,
  Prices: { TotalWithVat: d.total ?? 100 },
  PartnerAddress: { NickName: d.partner ?? "Zákazník" },
  Metadata: { DateCreated: d.created, DateLastChange: d.created },
});

function fakeIdoklad(docs: Doc[], ico = "74337297") {
  const calls: { method: string; path: string; filter: string | null }[] = [];
  const ok = (data: unknown) => new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: 200 }), { status: 200 });
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    const path = url.pathname.replace(/^\/v3/, "");
    const filter = url.searchParams.get("filter");
    calls.push({ method, path, filter });
    if (path === "/Account/CurrentAgenda") return ok({ Contact: { IdentificationNumber: ico } });
    if (path === "/NumericSequences") return ok({ Items: SEQUENCES, TotalItems: 2, TotalPages: 1 });
    if (path === "/IssuedInvoices") {
      const seq = Number(/NumericSequenceId~eq~(\d+)/.exec(filter ?? "")?.[1]);
      const items = docs.filter((d) => d.seq === seq).map(inv);
      return ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
    }
    return new Response("{}", { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

// stav podle auditu 22. 10. 2026 (časy vytvoření u ruční řady jsou ilustrační)
const LUCIE = 2032369;
const ESHOP = 7277293;
const DOCS: Doc[] = [
  { seq: LUCIE, Id: 1189, DocumentNumber: "20260189", issue: "2026-10-14", created: "2026-10-14T09:00:00" },
  { seq: LUCIE, Id: 1190, DocumentNumber: "20260190", issue: "2026-10-16", created: "2026-10-16T09:00:00", partner: "Logistic areal Kralupy EU, s.r.o.", total: 1348 },
  { seq: LUCIE, Id: 1191, DocumentNumber: "20260191", issue: "2026-10-15", created: "2026-10-16T10:00:00", partner: "Karolína Pospíšilová" },
  { seq: LUCIE, Id: 1192, DocumentNumber: "20260192", issue: "2026-10-22", created: "2026-10-22T08:00:00", partner: "Milan Kašpárek" },
  { seq: LUCIE, Id: 1193, DocumentNumber: "20260193", issue: "2026-10-22", created: "2026-10-22T08:30:00" },
  { seq: LUCIE, Id: 1194, DocumentNumber: "20260194", issue: "2026-10-22", created: "2026-10-22T09:00:00" },
  { seq: ESHOP, Id: 67077149, DocumentNumber: "9260001", issue: "2026-10-19", created: "2026-10-20T12:13:31", partner: "Food Fest Crew s.r.o.", vs: "5215", total: 12647 },
];
const NUMBERS = ["9260001", "20260190", "20260191", "20260192", "20260193", "20260194"];

describe("audit číslování vydaných faktur (jen čtení)", () => {
  it("obě řady: řada, data a vytvoření u vybraných čísel; zpětné datum 9260001 a obrácená chronologie 20260190/91", async () => {
    const { fetchImpl, calls } = fakeIdoklad(DOCS);
    const out = await runNumberingAuditFromEnv({ year: "2026", numbers: NUMBERS }, ENV, { fetchImpl });
    if (!out.ok) throw new Error(out.error);
    const r = out.result;
    expect(r.ok).toBe(true);
    expect(r.series).toEqual([
      { id: LUCIE, name: "Výchozí", isDefault: true, format: "{RRRR}{NNNN}", count: 6, first: "20260189", last: "20260194", truncated: false },
      { id: ESHOP, name: "E-shop Begina", isDefault: false, format: "9{RR}{NNNN}", count: 1, first: "9260001", last: "9260001", truncated: false },
    ]);
    expect(r.focus.find((f) => f.number === "9260001")!.document).toMatchObject({
      seriesId: ESHOP,
      seriesName: "E-shop Begina",
      dateOfIssue: "2026-10-19",
      created: "2026-10-20T12:13:31",
      partner: "Food Fest Crew s.r.o.",
      variableSymbol: "5215",
      totalKc: 12647,
    });
    expect(r.focus.find((f) => f.number === "20260192")!.document).toMatchObject({ seriesId: LUCIE, dateOfIssue: "2026-10-22", partner: "Milan Kašpárek" });
    expect(r.findings.map((f) => `${f.level} ${f.message}`)).toEqual([
      "warning 20260191 má datum vystavení 2026-10-15, dřívější než předchozí 20260190 (2026-10-16).",
      "warning 20260191: datum vystavení 2026-10-15, ale v iDokladu vznikl až 2026-10-16T10:00:00 (o 1 den později).",
      "warning 9260001: datum vystavení 2026-10-19, ale v iDokladu vznikl až 2026-10-20T12:13:31 (o 1 den později).",
    ]);
    // jen čtení: GET + token, nic jiného
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.map((c) => `${c.path} ${c.filter ?? ""}`.trim())).toEqual([
      "/Account/CurrentAgenda",
      "/NumericSequences DocumentType~eq~0",
      "/IssuedInvoices NumericSequenceId~eq~2032369",
      "/IssuedInvoices NumericSequenceId~eq~7277293",
    ]);
    // bez přístupových údajů a tokenu (log obsahuje jen cestu …/connect/token)
    expect(JSON.stringify(r)).not.toMatch(/\bcid\b|csecret|capp|Bearer|"tok"/);
  });

  it("duplicitní číslo, mezera v pořadí, číslo ve dvou řadách, nenalezené číslo", async () => {
    const docs = DOCS.filter((d) => d.DocumentNumber !== "20260193").concat(
      { seq: LUCIE, Id: 2192, DocumentNumber: "20260192", issue: "2026-10-22", created: "2026-10-22T08:05:00" },
      { seq: LUCIE, Id: 2001, DocumentNumber: "9260001", issue: "2026-10-20", created: "2026-10-20T13:00:00" }
    );
    const { fetchImpl } = fakeIdoklad(docs);
    const out = await runNumberingAuditFromEnv({ year: "2026", numbers: ["20260193"] }, ENV, { fetchImpl });
    if (!out.ok) throw new Error(out.error);
    const messages = out.result.findings.map((f) => `${f.level} ${f.message}`);
    expect(messages).toContain("error Číslo 20260192 je v řadě 2×.");
    expect(messages).toContain("error Číslo 9260001 je ve více řadách (2032369, 7277293).");
    expect(messages).toContain("warning Mezi 20260192 a 20260194 chybí 1 číslo (smazaný nebo nevystavený doklad?).");
    expect(out.result.findings[0].level).toBe("error"); // chyby první
    expect(out.result.focus).toEqual([{ number: "20260193", document: null }]);
  });

  it("jiná agenda než Begina → audit se nedokončí, doklady se nečtou", async () => {
    const { fetchImpl, calls } = fakeIdoklad(DOCS, "12345678");
    const out = await runNumberingAuditFromEnv({ year: "2026", numbers: [] }, ENV, { fetchImpl });
    if (!out.ok) throw new Error(out.error);
    expect(out.result).toMatchObject({ ok: false, error: "Přihlášená agenda má IČO 12345678 — není to Begina." });
    expect(calls.map((c) => c.path)).toEqual(["/Account/CurrentAgenda"]);
  });

  it("bez přístupových údajů nebo s neplatným rokem nic nevolá", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await runNumberingAuditFromEnv({ year: "2026", numbers: [] }, { VERCEL_ENV: "production" }, { fetchImpl })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Chybí přístupové údaje/),
    });
    expect(await runNumberingAuditFromEnv({ year: "26", numbers: [] }, ENV, { fetchImpl })).toEqual({ ok: false, error: "Zadejte rok (např. 2026)." });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("čistá analýza: předem datovaný doklad = jen informace; vyšší číslo vytvořené dřív = k vysvětlení", () => {
    const doc = (number: string, issue: string, created: string) =>
      toAuditDocument(inv({ seq: LUCIE, Id: Number(number.slice(-4)), DocumentNumber: number, issue, created }), { id: LUCIE, name: "Výchozí" });
    const findings = analyzeSeries("Výchozí", [doc("20260001", "2026-01-05", "2026-01-03T10:00:00"), doc("20260002", "2026-01-06", "2026-01-02T10:00:00")]);
    expect(findings.map((f) => `${f.level} ${f.message}`)).toEqual([
      "warning 20260002 vznikl v iDokladu (2026-01-02T10:00:00) dřív než nižší 20260001 (2026-01-03T10:00:00) — číslo přidělené mimo pořadí vzniku.",
      "info 20260001: datum vystavení 2026-01-05 je po vytvoření (2026-01-03T10:00:00).",
      "info 20260002: datum vystavení 2026-01-06 je po vytvoření (2026-01-02T10:00:00).",
    ]);
  });

  it("čísla z formuláře: jen číslice, bez opakování, nejvýš 20", () => {
    expect(parseAuditNumbers("9260001, 20260192;20260192  abc 12")).toEqual(["9260001", "20260192"]);
    expect(parseAuditNumbers(Array.from({ length: 30 }, (_, i) => String(20260100 + i)).join(","))).toHaveLength(20);
  });
});
