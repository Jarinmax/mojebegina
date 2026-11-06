// Dvě souběžné číselné řady od 20. 10. 2026: ruční fakturace Lucie
// (výchozí řada agendy, 2026xxxx) a MojeBegina (jen řada 7277293
// „E-shop Begina“, 9RRNNNN; první doklad 9260001). MojeBegina ruční řadu
// nesmí použít — pojistka v klientovi (před odesláním) a kontrola řady
// v preflightu (jen čtení), který běží před každým vystavením.
import { describe, expect, it, vi } from "vitest";
import { createFakeIdoklad } from "./helpers/fakeIdoklad";
import { EshopIdokladClient, andFilter, eqFilter, issuedInvoiceFilter } from "../invoicing/idokladHttp";
import { runPreflightFromEnv } from "../invoicing/preflight";

const ENV = {
  VERCEL_ENV: "production",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "cid",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp",
};
const NOW = new Date("2026-10-20T10:00:00Z");
const PAID = { PaymentStatus: 1, Prices: { TotalWithVat: 12647, TotalVat: 0, TotalPaid: 12647 }, body: { DateOfIssue: "2026-10-19T12:00:00.000" } };
/** stav iDokladu po 20. 10. 2026: 9260001 Food Fest Crew v řadě E-shop Begina, ruční řada Lucie dál */
const AFTER_FIRST = [
  { Id: 67077149, DocumentNumber: "9260001", VariableSymbol: "5215", NumericSequenceId: 7277293, PartnerId: 4242, ...PAID },
  { Id: 67000190, DocumentNumber: "20260190", VariableSymbol: "20260190", NumericSequenceId: 2032369, PartnerId: 77, ...PAID },
];
const NEXT = { DocumentNumber: "9260002", DocumentSerialNumber: 2, NumericSequenceId: 7277293 };

async function preflight(invoices: typeof AFTER_FIRST, nextNumber = NEXT, now = NOW) {
  const fake = createFakeIdoklad({ nextNumber });
  fake.invoices.push(...invoices);
  const out = await runPreflightFromEnv(ENV, { fetchImpl: fake.fetchImpl, now });
  if (!out.ok) throw new Error(out.error);
  const check = out.result.checks.find((c) => c.key === "series_documents")!;
  return { result: out.result, check, fake };
}

describe("řada E-shop Begina (7277293) vedle ruční řady 2026xxxx", () => {
  it("stav po 20. 10. 2026: řada 7277293, další číslo 9260002, 9260001 je v iDokladu jednou", async () => {
    const { result, check, fake } = await preflight(AFTER_FIRST);
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.key === "series")!.detail).toMatch(/^E-shop Begina, formát 9\{RR\}\{NNNN\}/);
    expect(result.checks.find((c) => c.key === "next_number")!.detail).toBe("9260002 (pořadí 2, 2026-10-20)");
    expect(check).toMatchObject({ ok: true, detail: "1 doklad, poslední 9260001 (v agendě jednou); další 9260002 je volné" });
    expect(result.resolved?.next).toEqual({ documentNumber: "9260002", serial: 2, day: "2026-10-20" });
    // jen čtení
    expect(fake.writes()).toEqual([]);
    expect(fake.calls.filter((c) => c.path === "/IssuedInvoices").map((c) => c.query.filter)).toEqual([
      "NumericSequenceId~eq~7277293",
      "DocumentNumber~eq~9260002",
      "DocumentNumber~eq~9260001",
    ]);
  });

  it("v řadě E-shop Begina je doklad s číslem ruční řady (2026xxxx) → kontrola neprojde, nic se nevystaví", async () => {
    const { result, check } = await preflight([
      ...AFTER_FIRST,
      { ...AFTER_FIRST[1], Id: 67000999, DocumentNumber: "20260999", NumericSequenceId: 7277293 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.resolved).toBeNull();
    expect(check).toMatchObject({ ok: false, detail: expect.stringMatching(/cizím číslem: 20260999/) });
  });

  it("číslo 9260001 je v agendě dvakrát (i v jiné řadě) → kontrola neprojde", async () => {
    const { result, check } = await preflight([
      ...AFTER_FIRST,
      { ...AFTER_FIRST[1], Id: 67000500, DocumentNumber: "9260001", NumericSequenceId: 2032369 },
    ]);
    expect(result.ok).toBe(false);
    expect(check).toMatchObject({ ok: false, detail: "Číslo 9260001 je v iDokladu 2× (musí být jednou)." });
  });

  it("další číslo 9260002 už v agendě existuje → kontrola neprojde", async () => {
    const { result, check } = await preflight([
      ...AFTER_FIRST,
      { ...AFTER_FIRST[1], Id: 67000501, DocumentNumber: "9260002", NumericSequenceId: 2032369 },
    ]);
    expect(result.ok).toBe(false);
    expect(check).toMatchObject({ ok: false, detail: "Další číslo 9260002 už v iDokladu existuje." });
  });

  it("další číslo z ruční řady (2026xxxx) nebo s jiným rokem → kontrola neprojde", async () => {
    const manual = await preflight(AFTER_FIRST, { DocumentNumber: "20260192", DocumentSerialNumber: 192, NumericSequenceId: 7277293 });
    expect(manual.result.ok).toBe(false);
    expect(manual.result.checks.find((c) => c.key === "next_number")!.detail).toMatch(/neodpovídá formátu 9\{RR\}\{NNNN\}/);

    const year = await preflight(AFTER_FIRST, NEXT, new Date("2027-01-04T10:00:00Z"));
    expect(year.result.ok).toBe(false);
    expect(year.result.checks.find((c) => c.key === "next_number")!.detail).toBe("Další číslo 9260002 nemá rok 2027 (927NNNN).");
  });

  it("vystavení do jiné řady než 7277293 klient zablokuje ještě před odesláním (ani token)", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const client = new EshopIdokladClient({
      clientId: "cid",
      clientSecret: "csecret",
      applicationId: "capp",
      writesAllowed: true,
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    for (const body of [{ NumericSequenceId: 2032369 }, { NumericSequenceId: "2032369" }, {}, null]) {
      await expect(client.post("/IssuedInvoices", body)).rejects.toThrow(/faktura mimo řadu 7277293 „E-shop Begina“/);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("složený filtr ve tvaru SDK: ověří se každý sloupec (VariableSymbol ani ve složeném filtru neprojde)", () => {
    const ok = andFilter(eqFilter("Id", "67077149"), eqFilter("NumericSequenceId", "7277293"));
    expect(ok).toBe("((Id~eq~67077149)~and~(NumericSequenceId~eq~7277293))");
    expect(issuedInvoiceFilter(ok)).toBe(ok);
    expect(() => issuedInvoiceFilter(andFilter(eqFilter("Id", "1"), eqFilter("VariableSymbol", "5215")))).toThrow(/nefiltruje podle VariableSymbol/);
    expect(() => issuedInvoiceFilter("nesmysl")).toThrow(/neplatný filtr/);
  });
});
