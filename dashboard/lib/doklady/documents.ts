import "server-only";

import { createHash } from "crypto";
import { del, get } from "@vercel/blob";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { economyDocuments, economyEntries } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";

// DOKLADY (Lucie 19. 11. 2026) — PDF a fotky dokladů nákladů po měsících.
// Soubory leží v privátním Blobu (stejně jako fotky příjemek): klient
// nahrává přímo přes podepsaný token, server pak ověří otisk proti
// skutečně uloženým bajtům a teprve potom zapíše řádek. Přístup jen
// vystavovatelé faktur (Jaroslav, Lucie) — stejně jako Ekonomika.

export const DOC_MAX_BYTES = 20 * 1024 * 1024;
export const DOC_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PATHNAME = /^doklady\/(\d{4}-(?:0[1-9]|1[0-2]))\/[0-9a-f-]{36}\.(pdf|jpg|png|webp|heic|heif)$/;

export class DocumentAccessError extends Error {}

export async function requireDocumentAccess() {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) throw new DocumentAccessError("Doklady smí vidět jen Jaroslav a Lucie.");
  return ctx;
}

export function isValidMonth(month: string): boolean {
  return MONTH.test(month);
}

/** Cesta souboru: doklady/RRRR-MM/<uuid>.<přípona>; měsíc musí sedět. */
export function isValidDocumentPathname(pathname: string, month?: string): boolean {
  const m = PATHNAME.exec(pathname);
  if (!m) return false;
  return month ? m[1] === month : true;
}

export function extensionForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

export type DocumentRow = {
  id: string;
  entryId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedByName: string | null;
};

export async function listMonthDocuments(month: string): Promise<DocumentRow[]> {
  await requireDocumentAccess();
  if (!isValidMonth(month)) return [];
  return db
    .select({
      id: economyDocuments.id,
      entryId: economyDocuments.entryId,
      filename: economyDocuments.filename,
      mimeType: economyDocuments.mimeType,
      sizeBytes: economyDocuments.sizeBytes,
      uploadedAt: economyDocuments.uploadedAt,
      uploadedByName: economyDocuments.uploadedByName,
    })
    .from(economyDocuments)
    .where(and(eq(economyDocuments.month, month), isNull(economyDocuments.deletedAt)))
    .orderBy(asc(economyDocuments.uploadedAt));
}

async function blobSha256(pathname: string): Promise<{ sha256: string; size: number } | null> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return null;
  const hash = createHash("sha256");
  let size = 0;
  const reader = blob.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      hash.update(value);
      size += value.byteLength;
    }
  }
  return { sha256: hash.digest("hex"), size };
}

async function cleanup(pathname: string) {
  try {
    await del(pathname);
  } catch {
    // best-effort
  }
}

function safeFilename(raw: string): string {
  const name = raw.normalize("NFC").replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  return name || "doklad";
}

async function entryInMonth(entryId: string, month: string): Promise<boolean> {
  const [row] = await db
    .select({ entryDate: economyEntries.entryDate, deletedAt: economyEntries.deletedAt, kind: economyEntries.kind })
    .from(economyEntries)
    .where(eq(economyEntries.id, entryId))
    .limit(1);
  return Boolean(row && !row.deletedAt && row.entryDate.slice(0, 7) === month);
}

export type RegisterInput = {
  month: string;
  pathname: string;
  filename: string;
  mimeType: string;
  sha256: string;
  entryId?: string | null;
};

export type DocResult = { ok: true; id?: string } | { ok: false; error: string };

/** Zápis po úspěšném uploadu do Blobu; při jakékoli chybě smaže osiřelý soubor. */
export async function registerDocument(input: RegisterInput): Promise<DocResult> {
  const ctx = await requireDocumentAccess();
  const pathname = input.pathname.trim();
  if (!isValidMonth(input.month) || !isValidDocumentPathname(pathname, input.month)) {
    return { ok: false, error: "Neplatná cesta nahraného souboru." };
  }
  if (!(DOC_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    await cleanup(pathname);
    return { ok: false, error: "Nahrávat jde jen PDF nebo fotky (JPG, PNG, HEIC)." };
  }
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
    await cleanup(pathname);
    return { ok: false, error: "Chybí otisk souboru — nahrajte ho znovu." };
  }
  const [existing] = await db
    .select({ id: economyDocuments.id })
    .from(economyDocuments)
    .where(eq(economyDocuments.storageKey, pathname))
    .limit(1);
  if (existing) return { ok: true, id: existing.id };

  if (input.entryId && !(await entryInMonth(input.entryId, input.month))) {
    await cleanup(pathname);
    return { ok: false, error: "Řádek Ekonomiky v tomto měsíci nebyl nalezen." };
  }
  const actual = await blobSha256(pathname);
  if (!actual) return { ok: false, error: "Soubor nebyl v úložišti nalezen — nahrajte ho znovu." };
  if (actual.sha256 !== input.sha256 || actual.size > DOC_MAX_BYTES) {
    await cleanup(pathname);
    return { ok: false, error: "Nahraný soubor se nepodařilo ověřit — nahrajte ho znovu." };
  }
  try {
    const [row] = await db
      .insert(economyDocuments)
      .values({
        entryId: input.entryId ?? null,
        month: input.month,
        storageKey: pathname,
        filename: safeFilename(input.filename),
        mimeType: input.mimeType,
        sizeBytes: actual.size,
        sha256: actual.sha256,
        uploadedByUserId: ctx.userId,
        uploadedByName: ctx.name ?? ctx.email,
      })
      .returning({ id: economyDocuments.id });
    return { ok: true, id: row.id };
  } catch (error) {
    console.error("Doklady: zápis dokladu selhal", error);
    await cleanup(pathname);
    return { ok: false, error: "Doklad se nepodařilo uložit. Zkuste to znovu." };
  }
}

/** Přiřazení dokladu k řádku Ekonomiky (null = zrušit přiřazení). */
export async function assignDocument(documentId: string, entryId: string | null): Promise<DocResult> {
  await requireDocumentAccess();
  const [doc] = await db
    .select({ month: economyDocuments.month, deletedAt: economyDocuments.deletedAt })
    .from(economyDocuments)
    .where(eq(economyDocuments.id, documentId))
    .limit(1);
  if (!doc || doc.deletedAt) return { ok: false, error: "Doklad nebyl nalezen." };
  if (entryId && !(await entryInMonth(entryId, doc.month))) return { ok: false, error: "Řádek Ekonomiky v tomto měsíci nebyl nalezen." };
  await db.update(economyDocuments).set({ entryId }).where(eq(economyDocuments.id, documentId));
  return { ok: true };
}

/** Odebrání dokladu (měkké — soubor zůstává v úložišti, jde dohledat). */
export async function removeDocument(documentId: string): Promise<DocResult> {
  await requireDocumentAccess();
  await db
    .update(economyDocuments)
    .set({ deletedAt: new Date() })
    .where(and(eq(economyDocuments.id, documentId), isNull(economyDocuments.deletedAt)));
  return { ok: true };
}

/** Soubor ke stažení (jen přihlášení vystavovatelé faktur). */
export async function openDocument(documentId: string): Promise<{ filename: string; mimeType: string; stream: ReadableStream<Uint8Array> } | null> {
  await requireDocumentAccess();
  const [doc] = await db
    .select({ storageKey: economyDocuments.storageKey, filename: economyDocuments.filename, mimeType: economyDocuments.mimeType, deletedAt: economyDocuments.deletedAt })
    .from(economyDocuments)
    .where(eq(economyDocuments.id, documentId))
    .limit(1);
  if (!doc || doc.deletedAt) return null;
  const blob = await get(doc.storageKey, { access: "private" });
  if (!blob || blob.statusCode !== 200) return null;
  return { filename: doc.filename, mimeType: doc.mimeType, stream: blob.stream };
}

/** Všechny doklady měsíce jako bajty (pro ZIP). */
export async function readMonthDocumentFiles(month: string): Promise<{ filename: string; bytes: Uint8Array }[]> {
  await requireDocumentAccess();
  const docs = await db
    .select({ storageKey: economyDocuments.storageKey, filename: economyDocuments.filename })
    .from(economyDocuments)
    .where(and(eq(economyDocuments.month, month), isNull(economyDocuments.deletedAt)))
    .orderBy(asc(economyDocuments.uploadedAt));
  const out: { filename: string; bytes: Uint8Array }[] = [];
  for (const d of docs) {
    const blob = await get(d.storageKey, { access: "private" });
    if (!blob || blob.statusCode !== 200) continue;
    out.push({ filename: d.filename, bytes: new Uint8Array(await new Response(blob.stream).arrayBuffer()) });
  }
  return out;
}
