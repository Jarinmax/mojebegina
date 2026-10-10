// @vitest-environment node
//
// Mobilní tok 1.0 — stejná mock technika jako skladAtomicity.test.ts (stub
// "server-only", nahradit @neondatabase/serverless transport špionem),
// tentokrát pro authorizeGoodsReceiptUpload/registerGoodsReceiptDocumentPage/
// listGoodsReceiptDocumentPages/getGoodsReceiptDocumentPageForDownload.
// @vercel/blob je taky zmockovaný (`del` i `get`) — testuje se, že se `del`
// SKUTEČNĚ zavolá při selhání zápisu (bod 10 zadání: osiřelý Blob) a
// NEzavolá při idempotentním no-opu nebo úspěchu, a že `get` skutečně
// dodává bajty, ze kterých appka PŘEPOČÍTÁ sha256 — server nikdy nevěří
// otisku poslanému klientem (externí revize, bod 2).
//
// Přesné SQL fragmenty použité v matcherech níž byly ověřené reálným během
// (ne odhadnuté) — diagnostický běh s console.log zachytil skutečný výstup
// drizzle-orm/neon-http pro každý dotaz, teprve pak se nahradil touhle
// finální verzí s asercemi.
//
// Co tenhle test NEMŮŽE dokázat: skutečné vynucení triggeru
// goods_receipt_document_pages_unique_active_sha256 ani unique indexu
// goods_receipt_document_pages_order_key živou Postgres databází — simuluje
// se jen chybová hláška, kterou by driver vrátil (stejné zdokumentované
// omezení jako u skladAtomicity.test.ts).
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";
const SUPPLIER_ID = "44444444-4444-4444-4444-444444444444";
const LOCATION_ID = "55555555-5555-5555-5555-555555555555";
const PAGE_UUID = "11111111-2222-3333-4444-555555555555";
const VALID_PATHNAME = `sklad/${RECEIPT_ID}/${PAGE_UUID}.jpg`;
// Pro testy, co se nikdy nedostanou až k ověření otisku proti Blobu (selžou
// dřív na formátu/oprávnění/draft kontrole) — formálně platný, obsah
// nehraje roli.
const SHA256_SAMPLE = "a".repeat(64);
// Skutečný obsah "nahraného souboru" v mocku a jeho SKUTEČNÝ sha256 —
// počítaný stejnou funkcí (node:crypto), jakou appka použije k ověření.
// Testy, co se dostanou až k zápisu do DB, musí poslat TENHLE otisk, jinak
// je appka (správně) odmítne jako neshodu (bod 2 externí revize).
const BLOB_CONTENT = new TextEncoder().encode("fake-jpeg-bytes-for-test");
const ACTUAL_SHA256 = createHash("sha256").update(BLOB_CONTENT).digest("hex");

// Řídí odpověď na SELECT …FROM goods_receipts (fetchReceiptForMutation) —
// null = "nenalezeno".
let receiptRow: unknown[] | null = ["draft", SUPPLIER_ID, null, LOCATION_ID];
// Řídí odpověď na idempotenční SELECT podle storage_key, KDYŽ sequence níž
// je prázdná/vyčerpaná — null = žádná existující stránka.
let existingPageId: string | null = null;
// Přepíše odpovědi na idempotenční SELECT podle storage_key PO POŘADÍ volání
// (index 0 = první volání, index 1 = druhé, …) — slouží k simulaci souběhu
// (bod 4 externí revize): první kontrola (před INSERTem) nic nenajde, druhá
// kontrola (až po chybě z DB triggeru) najde řádek, co mezitím zapsal
// souběžný vítěz. Když je sequence vyčerpaná, vrací se `existingPageId`.
let storageKeyLookupSequence: Array<string | null> = [];
let storageKeyLookupCallIndex = 0;
// Řídí odpověď na SELECT existujícího dokumentu příjemky — null = žádný
// dokument zatím neexistuje (vytvoří se nový).
let existingDocumentId: string | null = "doc-existing";
// Řídí COALESCE(MAX(page_number), 0).
let maxPageNumber = 0;
// Když není null, INSERT do goods_receipt_document_pages tuhle chybu
// vyhodí (simuluje DB trigger/unique index) místo vrácení řádku.
let insertPageError: Error | null = null;
// Řídí odpověď na SELECT pro getGoodsReceiptDocumentPageForDownload.
let downloadPageRow: [string, string] | null = ["sklad/other/path.jpg", "image/jpeg"];

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (sqlText: string, params: unknown[]) => {
    capturedQueries.push({ sql: sqlText, params });

    if (sqlText.includes('"id", "status", "supplier_id", "document_number", "stock_location_id"')) {
      if (!receiptRow) return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      return Promise.resolve({ rows: [[RECEIPT_ID, ...receiptRow]], rowCount: 1, fields: [] });
    }
    // Pořadí matcherů je důležité: víc fragmentů obsahuje "storage_key"
    // nebo table-name substring, proto se rozlišuje přesným `startsWith` na
    // celý "select <sloupce>" začátek (ověřeno diagnostickým během se
    // skutečným drizzle výstupem, ne odhadem).
    if (sqlText.startsWith('select "id" from "goods_receipt_document_pages"')) {
      const index = storageKeyLookupCallIndex;
      storageKeyLookupCallIndex += 1;
      const resultId = index < storageKeyLookupSequence.length ? storageKeyLookupSequence[index] : existingPageId;
      const rows = resultId ? [[resultId]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('select "id" from "goods_receipt_documents"')) {
      const rows = existingDocumentId ? [[existingDocumentId]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('insert into "goods_receipt_documents"')) {
      return Promise.resolve({ rows: [["doc-new"]], rowCount: 1, fields: [] });
    }
    if (sqlText.includes("COALESCE(MAX(")) {
      return Promise.resolve({ rows: [[maxPageNumber]], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('insert into "goods_receipt_document_pages"')) {
      if (insertPageError) return Promise.reject(insertPageError);
      return Promise.resolve({ rows: [["page-new"]], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('select "goods_receipt_document_pages"."id", "goods_receipt_document_pages"."page_number"')) {
      return Promise.resolve({ rows: [["page-1", 1, "image/jpeg", new Date("2026-01-01")]], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('select "goods_receipt_document_pages"."storage_key"')) {
      const rows = downloadPageRow ? [downloadPageRow] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  },
}));

const mockGetAuthContext = vi.fn<() => Promise<AuthContext>>();
vi.mock("../authContext", () => ({ getAuthContext: () => mockGetAuthContext() }));

// Řídí, co `get()` "našel" v Blobu — null = soubor v úložišti neexistuje
// (finalize bez skutečného uploadu). Jinak se z BLOB_CONTENT postaví
// ReadableStream, přesně jak by ho vrátil skutečný @vercel/blob `get`.
let blobContent: Uint8Array | null = BLOB_CONTENT;

function makeBlobStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const mockDel = vi.fn<(...args: unknown[]) => Promise<void>>();
const mockGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => mockDel(...args),
  get: (...args: unknown[]) => mockGet(...args),
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";
const CIZI_UZIVATEL = "99999999-9999-9999-9999-999999999999";

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
  receiptRow = ["draft", SUPPLIER_ID, null, LOCATION_ID];
  existingPageId = null;
  storageKeyLookupSequence = [];
  storageKeyLookupCallIndex = 0;
  existingDocumentId = "doc-existing";
  maxPageNumber = 0;
  insertPageError = null;
  downloadPageRow = ["sklad/other/path.jpg", "image/jpeg"];
  mockGetAuthContext.mockReset();
  mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
  mockDel.mockReset();
  mockDel.mockResolvedValue(undefined);
  blobContent = BLOB_CONTENT;
  mockGet.mockReset();
  mockGet.mockImplementation(async () => {
    if (blobContent === null) return null;
    return {
      statusCode: 200,
      stream: makeBlobStream(blobContent),
      headers: new Headers(),
      blob: { contentType: "image/jpeg", size: blobContent.length },
    };
  });
});

describe("authorizeGoodsReceiptUpload — bod 8 zadání (jen oprávněný uživatel, jen draft příjemka)", () => {
  it("nepřihlášený uživatel vyhodí UnauthenticatedError bez jakéhokoli SQL", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { authorizeGoodsReceiptUpload } = await import("../sklad");
    await expect(authorizeGoodsReceiptUpload(RECEIPT_ID, VALID_PATHNAME)).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
  });

  it("Střelec (bez requireUploadAccess) vyhodí ForbiddenError bez jakéhokoli SQL", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC));
    const { authorizeGoodsReceiptUpload } = await import("../sklad");
    await expect(authorizeGoodsReceiptUpload(RECEIPT_ID, VALID_PATHNAME)).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
  });

  it("cesta patřící jiné příjemce je odmítnuta ještě PŘED jakýmkoli SQL", async () => {
    const { authorizeGoodsReceiptUpload } = await import("../sklad");
    const foreignPathname = `sklad/00000000-0000-0000-0000-000000000000/${PAGE_UUID}.jpg`;
    const result = await authorizeGoodsReceiptUpload(RECEIPT_ID, foreignPathname);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(capturedQueries.length).toBe(0);
  });

  it("příjemka nenalezena → {ok:false}", async () => {
    receiptRow = null;
    const { authorizeGoodsReceiptUpload } = await import("../sklad");
    const result = await authorizeGoodsReceiptUpload(RECEIPT_ID, VALID_PATHNAME);
    expect(result.ok).toBe(false);
  });

  it("příjemka není 'draft' → {ok:false}", async () => {
    receiptRow = ["confirmed", SUPPLIER_ID, null, LOCATION_ID];
    const { authorizeGoodsReceiptUpload } = await import("../sklad");
    const result = await authorizeGoodsReceiptUpload(RECEIPT_ID, VALID_PATHNAME);
    expect(result.ok).toBe(false);
  });

  it("platná cesta + draft příjemka + oprávněný uživatel → {ok:true}", async () => {
    const { authorizeGoodsReceiptUpload } = await import("../sklad");
    const result = await authorizeGoodsReceiptUpload(RECEIPT_ID, VALID_PATHNAME);
    expect(result).toEqual({ ok: true });
  });
});

describe("registerGoodsReceiptDocumentPage — zápis po uploadu, idempotence a úklid osiřelého Blobu (body 7+10 zadání)", () => {
  it("nepřihlášený uživatel vyhodí UnauthenticatedError", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    await expect(
      registerGoodsReceiptDocumentPage(RECEIPT_ID, { pathname: VALID_PATHNAME, sha256: SHA256_SAMPLE, mimeType: "image/jpeg" })
    ).rejects.toThrow();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("Střelec (bez requireUploadAccess) vyhodí ForbiddenError", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC));
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    await expect(
      registerGoodsReceiptDocumentPage(RECEIPT_ID, { pathname: VALID_PATHNAME, sha256: SHA256_SAMPLE, mimeType: "image/jpeg" })
    ).rejects.toThrow();
  });

  it("neplatná cesta (nepatří téhle příjemce) → {ok:false}, Blob se NEMAŽE (cizí/neprokázaná cesta)", async () => {
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const foreignPathname = `sklad/00000000-0000-0000-0000-000000000000/${PAGE_UUID}.jpg`;
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: foreignPathname,
      sha256: SHA256_SAMPLE,
      mimeType: "image/jpeg",
    });
    expect(result.ok).toBe(false);
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("neplatné sha256 s jinak platnou (vlastní) cestou → {ok:false}, Blob SE maže", async () => {
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: "neplatny-hash",
      mimeType: "image/jpeg",
    });
    expect(result.ok).toBe(false);
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });

  it("nepodporovaný MIME typ (bod 3: server čeká jen JPEG) → {ok:false}, Blob SE maže", async () => {
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: SHA256_SAMPLE,
      mimeType: "image/heic",
    });
    expect(result.ok).toBe(false);
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });

  it("příjemka nenalezena → {ok:false}, Blob SE maže", async () => {
    receiptRow = null;
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: SHA256_SAMPLE,
      mimeType: "image/jpeg",
    });
    expect(result.ok).toBe(false);
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });

  it("příjemka už není 'draft' (potvrzena/stornována mezitím) → {ok:false}, Blob SE maže (bod 10)", async () => {
    receiptRow = ["confirmed", SUPPLIER_ID, null, LOCATION_ID];
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: SHA256_SAMPLE,
      mimeType: "image/jpeg",
    });
    expect(result.ok).toBe(false);
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });

  it("stejný storage_key už existuje → idempotentní no-op úspěch, ŽÁDNÝ INSERT, Blob se NEMAŽE, otisk se NEOVĚŘUJE znovu", async () => {
    existingPageId = "page-existing";
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: SHA256_SAMPLE,
      mimeType: "image/jpeg",
    });
    expect(result).toEqual({ ok: true, pageId: "page-existing" });
    expect(mockDel).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(capturedQueries.some((q) => q.sql.startsWith("insert into"))).toBe(false);
  });

  describe("ověření sha256 proti skutečným bajtům v Blobu (externí revize, bod 2 — server nikdy nevěří klientovi)", () => {
    it("klient nahlásí otisk, co neodpovídá skutečnému obsahu Blobu → {ok:false}, Blob SE maže, ŽÁDNÝ INSERT", async () => {
      const { registerGoodsReceiptDocumentPage } = await import("../sklad");
      const claimedButWrongSha256 = "b".repeat(64);
      const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
        pathname: VALID_PATHNAME,
        sha256: claimedButWrongSha256,
        mimeType: "image/jpeg",
      });
      expect(result.ok).toBe(false);
      expect(mockGet).toHaveBeenCalledWith(VALID_PATHNAME, { access: "private" });
      expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
      expect(capturedQueries.some((q) => q.sql.startsWith("insert into"))).toBe(false);
    });

    it("soubor na nahlášené cestě v Blobu vůbec neexistuje (finalize bez reálného uploadu) → {ok:false}, Blob SE maže (best-effort)", async () => {
      blobContent = null;
      const { registerGoodsReceiptDocumentPage } = await import("../sklad");
      const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
        pathname: VALID_PATHNAME,
        sha256: ACTUAL_SHA256,
        mimeType: "image/jpeg",
      });
      expect(result.ok).toBe(false);
      expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
      expect(capturedQueries.some((q) => q.sql.startsWith("insert into"))).toBe(false);
    });

    it("otisk odpovídá skutečnému obsahu → zápis uloží SERVER-OVĚŘENOU hodnotu (ne jen to, co poslal klient)", async () => {
      existingDocumentId = null;
      const { registerGoodsReceiptDocumentPage } = await import("../sklad");
      const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
        pathname: VALID_PATHNAME,
        sha256: ACTUAL_SHA256,
        mimeType: "image/jpeg",
      });
      expect(result).toEqual({ ok: true, pageId: "page-new" });
      const pageInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_document_pages"'))!;
      expect(pageInsert.params).toContain(ACTUAL_SHA256);
    });
  });

  it("nový dokument (žádný zatím neexistuje) se vytvoří a první strana má page_number 1", async () => {
    existingDocumentId = null;
    maxPageNumber = 0;
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: ACTUAL_SHA256,
      mimeType: "image/jpeg",
    });
    expect(result).toEqual({ ok: true, pageId: "page-new" });
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "goods_receipt_documents"'))).toBe(true);
    const pageInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_document_pages"'))!;
    expect(pageInsert.params).toContain(1);
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("existující dokument → žádný nový INSERT dokumentu, další strana má page_number = MAX+1", async () => {
    existingDocumentId = "doc-existing";
    maxPageNumber = 2;
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: ACTUAL_SHA256,
      mimeType: "image/jpeg",
    });
    expect(result.ok).toBe(true);
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "goods_receipt_documents"'))).toBe(false);
    const pageInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_document_pages"'))!;
    expect(pageInsert.params).toContain(3);
  });

  it("duplicitní SHA-256 (DB trigger, SKUTEČNĚ jiný soubor) → česká hláška, Blob SE maže (bod 6/7 revize návrhu)", async () => {
    insertPageError = new Error(
      `Stejný soubor (sha256 ${ACTUAL_SHA256}) už je součástí jiné aktivní (nestornované) příjemky`
    );
    // Oba pokusy o idempotenční SELECT (před INSERTem i po chybě z triggeru)
    // vrátí "nenalezeno" — tohle NENÍ souběh se sebou samým, je to opravdu
    // jiný, dřív nahraný soubor se stejným obsahem (viz test souběhu níž).
    storageKeyLookupSequence = [null, null];
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: ACTUAL_SHA256,
      mimeType: "image/jpeg",
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("jiné aktivní příjemky") });
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });

  it("souběžné finalize STEJNÉ cesty (síťová retry překrytá s původním voláním) se zotaví na idempotentní úspěch, Blob se NEMAŽE (bod 4 externí revize)", async () => {
    // Simuluje přesně popsaný souběh: první idempotenční SELECT (před
    // INSERTem) nic nenajde — obě souběžná volání se dostanou až k INSERTu.
    // Vítěz commitne, poražený spadne na sha256 triggeru (migrace 0023,
    // advisory lock). Druhý SELECT (až PO chybě z triggeru) najde řádek,
    // co mezitím zapsal vítěz, pod TOU SAMOU cestou.
    storageKeyLookupSequence = [null, "page-winner"];
    insertPageError = new Error(
      `Stejný soubor (sha256 ${ACTUAL_SHA256}) už je součástí jiné aktivní (nestornované) příjemky`
    );
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: ACTUAL_SHA256,
      mimeType: "image/jpeg",
    });
    expect(result).toEqual({ ok: true, pageId: "page-winner" });
    // Blob je legitimně použitý vítězovou stránkou (stejná cesta) — NESMÍ
    // se smazat.
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("souběžný konflikt pořadí stránek (unique index) → srozumitelná hláška, Blob SE maže", async () => {
    insertPageError = new Error('duplicate key value violates unique constraint "goods_receipt_document_pages_order_key"');
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");
    const result = await registerGoodsReceiptDocumentPage(RECEIPT_ID, {
      pathname: VALID_PATHNAME,
      sha256: ACTUAL_SHA256,
      mimeType: "image/jpeg",
    });
    expect(result.ok).toBe(false);
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });

  it("neznámá DB chyba se znovu vyhodí (nepolyká se) a Blob se PŘESTO maže", async () => {
    insertPageError = new Error("connection reset");
    const { registerGoodsReceiptDocumentPage } = await import("../sklad");

    let caught: unknown = null;
    try {
      await registerGoodsReceiptDocumentPage(RECEIPT_ID, { pathname: VALID_PATHNAME, sha256: ACTUAL_SHA256, mimeType: "image/jpeg" });
    } catch (error) {
      caught = error;
    }

    // drizzle-orm obaluje chybu do DrizzleQueryError (.message = "Failed
    // query: …") — opravdová příčina žije až v .cause (viz messageIncludes
    // komentář v sklad.ts).
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { cause?: unknown }).cause).toBe(insertPageError);
    expect(mockDel).toHaveBeenCalledWith(VALID_PATHNAME);
  });
});

describe("listGoodsReceiptDocumentPages / getGoodsReceiptDocumentPageForDownload — gated náhled (bod 9 zadání)", () => {
  it("cizí uživatel bez requirePricesAndOriginalAccess vyhodí ForbiddenError ještě PŘED jakýmkoli SQL nebo čtením Blobu", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(CIZI_UZIVATEL));
    const { listGoodsReceiptDocumentPages, getGoodsReceiptDocumentPageForDownload } = await import("../sklad");

    await expect(listGoodsReceiptDocumentPages(RECEIPT_ID)).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);

    await expect(getGoodsReceiptDocumentPageForDownload(RECEIPT_ID, "page-1")).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("listGoodsReceiptDocumentPages nikdy nevrací storage_key, jen metadata náhledu", async () => {
    const { listGoodsReceiptDocumentPages } = await import("../sklad");
    const pages = await listGoodsReceiptDocumentPages(RECEIPT_ID);
    expect(pages).toEqual([{ id: "page-1", pageNumber: 1, mimeType: "image/jpeg", createdAt: new Date("2026-01-01") }]);
    expect(pages[0]).not.toHaveProperty("storageKey");
  });

  it("getGoodsReceiptDocumentPageForDownload vrátí pathname+mimeType jen po ověření přístupu a nalezení stránky v DB (ne přímo z Blobu)", async () => {
    downloadPageRow = ["sklad/some/path.jpg", "image/jpeg"];
    const { getGoodsReceiptDocumentPageForDownload } = await import("../sklad");
    const result = await getGoodsReceiptDocumentPageForDownload(RECEIPT_ID, "page-1");
    expect(result).toEqual({ ok: true, pathname: "sklad/some/path.jpg", mimeType: "image/jpeg" });
    // Samotná datová funkce vrací jen pathname (pro route handler, co ho
    // dál pošle do Blob get()) — nikdy žádnou url/downloadUrl.
    expect(result).not.toHaveProperty("url");
    // getGoodsReceiptDocumentPageForDownload sama o sobě Blob nečte (to dělá
    // až route handler) — ověřuje jen DB vlastnictví stránky.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("stránka nenalezena (nepatří téhle příjemce nebo neexistuje) → {ok:false}", async () => {
    downloadPageRow = null;
    const { getGoodsReceiptDocumentPageForDownload } = await import("../sklad");
    const result = await getGoodsReceiptDocumentPageForDownload(RECEIPT_ID, "page-1");
    expect(result.ok).toBe(false);
  });
});
