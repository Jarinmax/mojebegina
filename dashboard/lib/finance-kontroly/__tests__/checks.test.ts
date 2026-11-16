import { describe, expect, it } from "vitest";
import {
  CHECKS,
  checkCompleteness,
  checkEconomyDuplicates,
  checkGaps,
  checkHighAmounts,
  checkInvoiceNumbering,
  checkInvoicesInEconomy,
  checkOrderPayments,
  checkOrdersWithoutInvoice,
  findingStates,
  summarizeFindings,
  type EconomyCheckRow,
  type Finding,
  type LogEntry,
  type OrderCheckRow,
} from "../checks";
import { idokladFindings } from "../idokladFindings";

let seq = 0;
const row = (over: Partial<EconomyCheckRow>): EconomyCheckRow => ({
  id: `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`,
  kind: "cost",
  entryDate: "2026-03-04",
  title: "Zboží do bistra",
  counterparty: "Lidl",
  amountHal: 45_000,
  paymentForm: null,
  invoiceNumber: null,
  ...over,
});

const income = (number: string | null, over: Partial<EconomyCheckRow> = {}) =>
  row({ kind: "income", title: "Faktura", counterparty: "Klient s.r.o.", paymentForm: "převodem", invoiceNumber: number, amountHal: 120_000, ...over });

const order = (over: Partial<OrderCheckRow>): OrderCheckRow => ({
  id: `order-${++seq}`,
  orderNumber: null,
  label: "Kavárna",
  channel: "manual",
  orderedAt: "2026-10-01",
  totalKc: 1200,
  paymentStatus: "unpaid",
  fulfillmentStatus: "new",
  balanceState: "unpaid",
  receivedHal: 0,
  requiredHal: 120_000,
  issuedInvoiceNumber: null,
  ...over,
});

describe("katalog kontrol", () => {
  it("má jedinečné klíče a každá kontrola patří do skupiny", () => {
    expect(new Set(CHECKS.map((c) => c.key)).size).toBe(CHECKS.length);
    expect(CHECKS.every((c) => ["ekonomika", "objednavky", "idoklad"].includes(c.group))).toBe(true);
  });
});

describe("duplicity", () => {
  it("najde stejný zápis dvakrát bez ohledu na velikost písmen a diakritiku", () => {
    const a = row({ counterparty: "Lidl" });
    const b = row({ counterparty: "LIDL " });
    const other = row({ amountHal: 45_001 });
    const findings = checkEconomyDuplicates([a, b, other]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("2× stejný náklad");
    expect(findings[0].key).toBe(`dup:${[a.id, b.id].sort().join("+")}`);
  });

  it("příjem a náklad stejné částky nejsou duplicita", () => {
    expect(checkEconomyDuplicates([row({}), row({ kind: "income" })])).toEqual([]);
  });
});

describe("číslování faktur", () => {
  it("hlásí duplicitu, mezeru i rozsah mezery", () => {
    const findings = checkInvoiceNumbering([income("20260001"), income("20260002"), income("20260002"), income("20260005"), income("9260001"), income("9260002")]);
    expect(findings.find((f) => f.key === "inv-dup:20260002")?.level).toBe("error");
    const gap = findings.find((f) => f.key.startsWith("inv-gap:"));
    expect(gap?.key).toBe("inv-gap:20260003-20260004");
    expect(gap?.message).toContain("2 faktur");
    expect(findings).toHaveLength(2);
  });

  it("jedna chybějící faktura a neobvyklý tvar čísla", () => {
    const findings = checkInvoiceNumbering([income("20260010"), income("20260012"), income("FA-1")]);
    expect(findings.map((f) => f.key).sort()).toEqual(["inv-format:FA-1", "inv-gap:20260011-20260011"]);
  });

  it("náklady s číslem faktury nepočítá", () => {
    expect(checkInvoiceNumbering([row({ invoiceNumber: "20260001" }), row({ invoiceNumber: "20260009" })])).toEqual([]);
  });
});

describe("úplnost", () => {
  it("faktura bez čísla, náklad bez prodávajícího, budoucí datum, způsob úhrady", () => {
    const findings = checkCompleteness(
      [
        income(null),
        row({ counterparty: null }),
        row({ entryDate: "2026-12-01" }),
        income("20260001", { paymentForm: null }),
        income("20260002", { paymentForm: "bitcoin" }),
        income(null, { title: "Tržby bistro", counterparty: null, paymentForm: "hotově, QR, kartou" }),
      ],
      "2026-11-16"
    );
    const kinds = findings.map((f) => f.key.split(":")[0]).sort();
    expect(kinds).toEqual(["future", "no-invoice-number", "no-payment-form", "no-seller", "payment-form"]);
  });
});

describe("vysoké částky", () => {
  it("u malého počtu zápisů platí pevná hranice 5 000 Kč", () => {
    const findings = checkHighAmounts([row({ amountHal: 499_999 }), row({ amountHal: 500_000 })]);
    expect(findings).toHaveLength(1);
  });

  it("u velkého počtu hlásí horní 1 %", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row({ amountHal: (i + 1) * 10_000 }));
    // 1 %: hodnoty od 198. pořadí (1 980 000 hal = 19 800 Kč)
    expect(checkHighAmounts(rows)).toHaveLength(3);
  });
});

describe("mezery", () => {
  it("uplynulý měsíc bez příjmu a dlouhé období bez nákladu", () => {
    const rows = [row({ entryDate: "2026-01-02" }), income("20260001", { entryDate: "2026-01-05" }), row({ entryDate: "2026-02-20" }), income("20260002", { entryDate: "2026-03-01" })];
    const findings = checkGaps(rows, 2026, "2026-03-10");
    const keys = findings.map((f) => f.key);
    expect(keys).toContain("month-empty:income:2026-02");
    expect(keys).toContain("cost-gap:2026-01-03");
    expect(keys).not.toContain("month-empty:cost:2026-03"); // březen ještě neskončil
  });

  it("minulý rok kontroluje všech 12 měsíců", () => {
    const findings = checkGaps([row({ entryDate: "2025-01-10" }), income("20250001", { entryDate: "2025-01-10" })], 2025, "2026-11-16");
    expect(findings.filter((f) => f.key.startsWith("month-empty:cost")).length).toBe(11);
  });
});

describe("objednávky a platby", () => {
  it("doručená nebo zaplacená objednávka bez faktury, stornovaná ne", () => {
    const findings = checkOrdersWithoutInvoice([
      order({ fulfillmentStatus: "delivered" }),
      order({ paymentStatus: "paid" }),
      order({ fulfillmentStatus: "delivered", issuedInvoiceNumber: "20260001" }),
      order({ fulfillmentStatus: "cancelled", paymentStatus: "paid" }),
      order({}),
    ]);
    expect(findings).toHaveLength(2);
  });

  it("zaplacená bez platby, přeplatek, storno s penězi, dlouho neuhrazená, nespárovaná platba", () => {
    const findings = checkOrderPayments(
      [
        order({ paymentStatus: "paid", balanceState: "unpaid" }),
        order({ paymentStatus: "paid", balanceState: "overpaid", receivedHal: 130_000 }),
        order({ fulfillmentStatus: "cancelled", balanceState: "paid", receivedHal: 120_000 }),
        order({ fulfillmentStatus: "delivered", orderedAt: "2026-10-01" }),
        order({ paymentStatus: "paid", balanceState: "paid", receivedHal: 120_000 }),
      ],
      [{ id: "p1", occurredAt: "2026-11-01", amountHal: 50_000, method: "bank_transfer", vs: "123", matchStatus: "unmatched" }],
      "2026-11-16"
    );
    const kinds = findings.map((f) => f.key.split(":")[0]).sort();
    expect(kinds).toEqual(["cancelled-paid", "delivered-unpaid", "overpaid", "paid-no-payment", "payment-unmatched"]);
  });
});

describe("faktury z MojeBegina v Ekonomice", () => {
  it("chybějící faktura a jiná částka", () => {
    const findings = checkInvoicesInEconomy(
      [
        { number: "9260001", totalKc: 1200, issuedAt: "2026-10-02", orderId: "o1" },
        { number: "9260002", totalKc: 800, issuedAt: "2026-10-03", orderId: "o2" },
        { number: "9260003", totalKc: 500, issuedAt: "2026-10-04", orderId: "o3" },
      ],
      [income("9260001", { amountHal: 120_000 }), income("9260002", { amountHal: 70_000 })]
    );
    expect(findings.map((f) => f.key)).toEqual(["invoice-amount:9260002", "invoice-missing:9260003"]);
  });
});

describe("stav nálezů podle deníku", () => {
  const findings: Finding[] = [
    { key: "a", level: "error", message: "A" },
    { key: "b", level: "warning", message: "B" },
    { key: "c", level: "info", message: "C" },
  ];
  const entry = (findingKey: string, action: LogEntry["action"], createdAt: string): LogEntry => ({
    id: `${findingKey}-${createdAt}`,
    checkKey: "ekonomika-duplicity",
    findingKey,
    action,
    note: null,
    snapshot: null,
    authorName: "Lucie",
    createdAt,
  });

  it("platí poslední rozhodnutí, poznámka stav nemění, opraveno a pořád nalezeno zůstává otevřené", () => {
    const states = findingStates(findings, [
      entry("a", "ok", "2026-11-01T10:00:00Z"),
      entry("a", "note", "2026-11-02T10:00:00Z"),
      entry("b", "ok", "2026-11-01T10:00:00Z"),
      entry("b", "fixed", "2026-11-03T10:00:00Z"),
    ]);
    expect(states.get("a")).toBe("ok");
    expect(states.get("b")).toBe("fixed_still_present");
    expect(states.get("c")).toBe("open");
    expect(summarizeFindings(findings, states)).toEqual({ errors: 0, warnings: 1, infos: 1, open: 2, resolved: 1 });
  });
});

describe("nálezy z iDokladu", () => {
  it("po splatnosti = chyba, zpětné vystavení = k ověření", () => {
    const findings = idokladFindings(
      { findings: [{ level: "error", series: "Begina", numbers: ["20260005"], message: "Číslo 20260005 je v řadě 2×." }] },
      {
        unpaid: [
          { number: "20260100", totalKc: 5000, paidKc: 0, payment: "unpaid", overdueDays: 12, dateOfMaturity: "2026-11-04", partner: { name: "Firma" } },
          { number: "20260101", totalKc: 800, paidKc: 0, payment: "unpaid", overdueDays: 0, dateOfMaturity: "2026-11-30", partner: null },
        ],
        discrepancies: [{ kind: "backdated", number: "20260090", message: "20260090: vystaveno zpětně." }],
      }
    );
    expect(findings.map((f) => f.level)).toEqual(["error", "error", "info", "info"]);
    expect(findings[1].message).toContain("12 dní po splatnosti");
  });
});
