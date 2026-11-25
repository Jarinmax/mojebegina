import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/data/sklad", () => ({}));
vi.mock("@/lib/data/authContext", () => ({ getAuthContext: vi.fn() }));
import { parseReceiptArgs } from "../sklad";

const base = { supplier_name: "Obalia", idempotency_key: "test-key-0001" };

describe("record_stock_receipt — argumenty", () => {
  it("přijme příjem zadaný slovy", () => {
    const r = parseReceiptArgs({
      ...base,
      document_number: "2204403",
      lines: [{ name: "Kapsička stříbrná 250 ml", kind: "operating_supply", unit: "ks", packages: 8, units_per_package: 25, package_label: "balení 25 ks", total_kc: 1168 }],
    });
    expect(r.lines[0]).toMatchObject({ packages: 8, unitsPerPackage: 25, unit: "ks", totalKc: 1168 });
    expect(r.documentNumber).toBe("2204403");
  });
  it("odmítne chybějícího dodavatele, prázdné položky a špatnou jednotku", () => {
    expect(() => parseReceiptArgs({ idempotency_key: "test-key-0001", lines: [] })).toThrow(/supplier_name/);
    expect(() => parseReceiptArgs({ ...base, lines: [] })).toThrow(/1–30/);
    expect(() => parseReceiptArgs({ ...base, lines: [{ name: "Lípa", kind: "stock_material", unit: "Kg!", packages: 1, units_per_package: 1, total_kc: 1 }] })).toThrow(/unit/);
    expect(() => parseReceiptArgs({ ...base, lines: [{ name: "Lípa", kind: "stock_material", unit: "kg", packages: 0, units_per_package: 1, total_kc: 1 }] })).toThrow(/packages/);
  });
});
