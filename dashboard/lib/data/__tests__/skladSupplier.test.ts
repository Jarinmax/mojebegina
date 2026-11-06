// @vitest-environment node
//
// Mobilní tok 1.0 — "+ Založit dodavatele" (mobilní test odkryl blokér:
// Nová příjemka bez dodavatelů nenabízela jejich vytvoření). createSupplier
// existovala už z dřívějška (lib/data/sklad.ts) beze zvláštního testu —
// tohle je první přímé pokrytí jejího oprávnění, validace a překladu
// duplicitních DB omezení na české hlášky. Stejná mock technika jako
// skladAtomicity.test.ts/skladUpload.test.ts (stub "server-only", nahradit
// @neondatabase/serverless transport špionem).
//
// Co tenhle test NEMŮŽE dokázat: skutečné vynucení unique indexů
// suppliers_ico_key/suppliers_name_normalized_key živou Postgres databází —
// simuluje se jen chybová hláška, kterou by driver vrátil (stejné
// zdokumentované omezení jako u skladAtomicity.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

// Když není null, INSERT do suppliers tuhle chybu vyhodí (simuluje DB
// unique index) místo vrácení řádku.
let insertSupplierError: Error | null = null;

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (sqlText: string, params: unknown[]) => {
    capturedQueries.push({ sql: sqlText, params });
    if (sqlText.startsWith('insert into "suppliers"')) {
      if (insertSupplierError) return Promise.reject(insertSupplierError);
      return Promise.resolve({ rows: [["supplier-new"]], rowCount: 1, fields: [] });
    }
    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  },
}));

const mockGetAuthContext = vi.fn<() => Promise<AuthContext>>();
vi.mock("../authContext", () => ({ getAuthContext: () => mockGetAuthContext() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";

function ctxFor(userId: string): AuthContext {
  return {
    userId,
    systemRole: "ADMIN",
    grantedRoles: ["ADMIN"],
    roleSelectionRequired: false,
    name: "Test",
    email: "test@example.com",
  };
}

beforeEach(() => {
  capturedQueries.length = 0;
  insertSupplierError = null;
  mockGetAuthContext.mockReset();
  mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
});

describe("createSupplier — oprávnění (requireReviewAccess, bod „+ Založit dodavatele“)", () => {
  it("nepřihlášený uživatel vyhodí UnauthenticatedError bez jakéhokoli SQL", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { createSupplier } = await import("../sklad");
    await expect(createSupplier({ name: "Test", ico: "", dic: "" })).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
  });

  it("Jiří Střelec (jen ceny/originál, bez requireReviewAccess) vyhodí ForbiddenError bez jakéhokoli SQL", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC));
    const { createSupplier } = await import("../sklad");
    await expect(createSupplier({ name: "Test", ico: "", dic: "" })).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
  });
});

describe("createSupplier — validace vstupu (žádný SQL při neplatném vstupu)", () => {
  it("prázdný název je odmítnut ještě PŘED jakýmkoli SQL", async () => {
    const { createSupplier } = await import("../sklad");
    const result = await createSupplier({ name: "   ", ico: "", dic: "" });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(capturedQueries.length).toBe(0);
  });

  it("neplatný formát IČO je odmítnut ještě PŘED jakýmkoli SQL", async () => {
    const { createSupplier } = await import("../sklad");
    const result = await createSupplier({ name: "Test", ico: "12AB", dic: "" });
    expect(result.ok).toBe(false);
    expect(capturedQueries.length).toBe(0);
  });

  it("platný vstup (jen název, IČO/DIČ nepovinné) → {ok:true}", async () => {
    const { createSupplier } = await import("../sklad");
    const result = await createSupplier({ name: "Pivovar Náchod", ico: "", dic: "" });
    expect(result).toEqual({ ok: true, supplierId: "supplier-new" });
  });

  it("platný vstup se vším vyplněným → {ok:true}", async () => {
    const { createSupplier } = await import("../sklad");
    const result = await createSupplier({ name: "Makro Cash & Carry ČR", ico: "74337297", dic: "CZ8005124303" });
    expect(result).toEqual({ ok: true, supplierId: "supplier-new" });
  });
});

describe("createSupplier — duplicity přeložené na české hlášky", () => {
  it("duplicitní IČO (DB unique index suppliers_ico_key) → srozumitelná česká hláška", async () => {
    insertSupplierError = new Error('duplicate key value violates unique constraint "suppliers_ico_key"');
    const { createSupplier } = await import("../sklad");
    const result = await createSupplier({ name: "Jiný název", ico: "74337297", dic: "" });
    expect(result).toEqual({ ok: false, error: "Dodavatel s tímto IČO už existuje." });
  });

  it("duplicitní normalizovaný název bez IČO (DB unique index suppliers_name_normalized_key) → srozumitelná česká hláška", async () => {
    insertSupplierError = new Error('duplicate key value violates unique constraint "suppliers_name_normalized_key"');
    const { createSupplier } = await import("../sklad");
    const result = await createSupplier({ name: "  Pivovar   Náchod ", ico: "", dic: "" });
    expect(result).toEqual({ ok: false, error: "Dodavatel s tímto názvem (bez IČO) už existuje." });
  });

  it("neznámá DB chyba se znovu vyhodí (nepolyká se)", async () => {
    insertSupplierError = new Error("connection reset");
    const { createSupplier } = await import("../sklad");
    let caught: unknown = null;
    try {
      await createSupplier({ name: "Test", ico: "", dic: "" });
    } catch (error) {
      caught = error;
    }
    // drizzle-orm obaluje chybu do DrizzleQueryError — opravdová příčina
    // žije v .cause (viz messageIncludes komentář v sklad.ts).
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { cause?: unknown }).cause).toBe(insertSupplierError);
  });
});
