// EKONOMIKA 1.0 — nástroje asistenta pro příjmy a náklady (economy_entries).
// Jen pro Jaroslava a Lucii (isInvoiceIssuer); zápis jen se souhlasem
// mojebegina.invoicing (finance), stejně jako fakturace.
import { noDocumentReason } from "@/lib/doklady/noDocument";
import "server-only";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { economyEntries, economyEntryChanges } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { parseAmountToHal, parseEntryDate, PAYMENT_FORMS } from "@/lib/ekonomika/economy";
import { ArgError, idempotencyKey, optionalString, requiredString, requiredUuid } from "../args";
import { defineTool, type AgentTool } from "../define";
import { assignDocument, attachDocumentBytes, documentCounts, extensionForMime, listMonthDocuments, removeDocument } from "@/lib/doklady/documents";
import { signUploadLink, uploadLinkSecret, UPLOAD_LINK_MINUTES } from "@/lib/doklady/uploadLink";
import { getAppOrigin as appOrigin } from "@/lib/appOrigin";

/** Strop těla požadavku na /api/doklady/nahrat (Vercel ~4,5 MB). */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
import { emailDocumentPdf } from "@/lib/doklady/emailDocumentPdf";

const DENIED = `Ekonomiku smí číst a zapisovat jen ${INVOICE_ISSUER_NAMES}.`;
const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);
const ECONOMY_URL = "https://moje.begina.cz/rizeni-firmy/ekonomika";

function kindOf(args: Record<string, unknown>): "income" | "cost" {
  if (args.kind === "cost" || args.kind === "income") return args.kind;
  throw new ArgError("Argument kind musí být cost (náklad) nebo income (příjem).");
}

function monthOf(args: Record<string, unknown>): { from: string; to: string; label: string } {
  const raw = requiredString(args, "month", 7);
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new ArgError("Argument month musí být ve tvaru RRRR-MM, např. 2026-11.");
  const year = Number(match[1]);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { from: `${raw}-01`, to: next, label: raw };
}


const NO_HISTORY = "Úprava a mazání v Ekonomice ještě nejsou zapnuté — nejdřív je potřeba v Neonu spustit skript 129_ekonomika_historie_MAIN.sql.";

async function historyTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.economy_entry_changes') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

type EntryRow = typeof economyEntries.$inferSelect;
type EditableField = "entryDate" | "title" | "counterparty" | "amountHal" | "amountNoShippingHal" | "paymentForm" | "invoiceNumber" | "note";
type EntryPatch = Partial<Pick<EntryRow, EditableField>>;

const FIELD_LABELS: Record<EditableField, string> = {
  entryDate: "datum",
  title: "co / typ",
  counterparty: "prodávající / klient",
  amountHal: "částka",
  amountNoShippingHal: "cena bez dopravy",
  paymentForm: "forma úhrady",
  invoiceNumber: "číslo faktury",
  note: "poznámka",
};

const has = (args: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(args, key);

function optionalAmount(args: Record<string, unknown>, key: string): number | null {
  const raw = args[key];
  if (raw === null || raw === "") return null;
  const hal = parseAmountToHal(String(raw));
  if (hal === null) throw new ArgError(`Argument ${key} musí být kladná částka v Kč.`);
  return hal;
}

/** Jen pole, která model opravdu poslal; prázdný text = smazat hodnotu (u nepovinných polí). */
export function parseEntryPatch(args: Record<string, unknown>): EntryPatch {
  const patch: EntryPatch = {};
  if (has(args, "date")) {
    const entryDate = parseEntryDate(requiredString(args, "date", 10));
    if (!entryDate) throw new ArgError("Argument date musí být platné datum RRRR-MM-DD.");
    patch.entryDate = entryDate;
  }
  if (has(args, "title")) patch.title = requiredString(args, "title", 300);
  if (has(args, "counterparty")) patch.counterparty = optionalString(args, "counterparty", 300);
  if (has(args, "amount_kc")) {
    const amountHal = parseAmountToHal(String(args.amount_kc ?? ""));
    if (amountHal === null) throw new ArgError("Argument amount_kc musí být kladná částka v Kč.");
    patch.amountHal = amountHal;
  }
  if (has(args, "amount_no_shipping_kc")) patch.amountNoShippingHal = optionalAmount(args, "amount_no_shipping_kc");
  if (has(args, "payment_form")) patch.paymentForm = optionalString(args, "payment_form", 60);
  if (has(args, "invoice_number")) patch.invoiceNumber = optionalString(args, "invoice_number", 40);
  if (has(args, "note")) patch.note = optionalString(args, "note", 500);
  if (Object.keys(patch).length === 0) throw new ArgError("Není co měnit — pošlete aspoň jedno pole (např. note: \"\" pro smazání poznámky).");
  return patch;
}

const shown = (field: EditableField, value: unknown) =>
  value === null || value === undefined ? null : field === "amountHal" || field === "amountNoShippingHal" ? Number(value) / 100 : value;

function entryView(row: EntryRow) {
  return {
    id: row.id,
    kind: row.kind,
    date: row.entryDate,
    title: row.title,
    counterparty: row.counterparty,
    amountKc: row.amountHal / 100,
    note: row.note,
  };
}

async function loadLiveEntry(id: string): Promise<EntryRow | null> {
  const [row] = await db.select().from(economyEntries).where(and(eq(economyEntries.id, id), isNull(economyEntries.deletedAt))).limit(1);
  return row ?? null;
}

export const ECONOMY_TOOLS: AgentTool[] = [
  defineTool({
    name: "economy_list_entries",
    title: "Ekonomika — příjmy nebo náklady za měsíc",
    description:
      "JEN ČTENÍ — vypíše zapsané náklady (kind=cost) nebo příjmy (kind=income) z Ekonomiky v MojeBegina za jeden měsíc (month=RRRR-MM) se součtem. Před zápisem nového řádku tím ověř, že tam už není (stejné datum, částka a prodávající). Údaje jsou důvěrné — jen pro Jaroslava a Lucii.",
    write: false,
    visible: issuerOnly,
    properties: {
      kind: { type: "string", enum: ["cost", "income"], description: "cost = náklady, income = příjmy." },
      month: { type: "string", description: "Měsíc RRRR-MM, např. 2026-11." },
    },
    required: ["kind", "month"],
    parse: (args) => ({ kind: kindOf(args), month: monthOf(args) }),
    execute: async ({ kind, month }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const rows = await db
        .select()
        .from(economyEntries)
        .where(and(eq(economyEntries.kind, kind), isNull(economyEntries.deletedAt), gte(economyEntries.entryDate, month.from), lt(economyEntries.entryDate, month.to)))
        .orderBy(asc(economyEntries.entryDate), asc(economyEntries.createdAt));
      const totalHal = rows.reduce((sum, row) => sum + row.amountHal, 0);
      const docs = kind === "cost" ? await documentCounts(rows.slice(0, 300).map((r) => r.id)).catch(() => new Map<string, number>()) : new Map<string, number>();
      return {
        ok: true,
        summary: { count: rows.length },
        data: {
          kind,
          month: month.label,
          count: rows.length,
          totalKc: totalHal / 100,
          truncated: rows.length > 300,
          entries: rows.slice(0, 300).map((row) => ({
            id: row.id,
            date: row.entryDate,
            title: row.title,
            counterparty: row.counterparty,
            amountKc: row.amountHal / 100,
            paymentForm: row.paymentForm,
            invoiceNumber: row.invoiceNumber,
            note: row.note,
            amountNoShippingKc: row.amountNoShippingHal === null ? null : row.amountNoShippingHal / 100,
            source: row.source,
            ...(kind === "cost" ? { documents: docs.get(row.id) ?? 0, documentNeeded: noDocumentReason(row.note) === null } : {}),
          })),
          url: ECONOMY_URL,
        },
      };
    },
  }),
  defineTool({
    name: "economy_list_documents",
    title: "Doklady — seznam dokladů měsíce (i nepřiřazených)",
    description:
      "JEN ČTENÍ — vypíše doklady (PDF, fotky) nahrané v Řízení firmy → Doklady za jeden měsíc (month=RRRR-MM): id dokladu, název souboru, k jakému řádku nákladu patří (entry_id, null = NEPŘIŘAZENÝ), kdo a kdy ho nahrál. Slouží k úklidu: nepřiřazené doklady přiřaď nebo odeber nástrojem economy_manage_document.",
    write: false,
    visible: issuerOnly,
    properties: {
      month: { type: "string", description: "Měsíc RRRR-MM, např. 2026-11." },
    },
    required: ["month"],
    parse: (args) => ({ month: monthOf(args).label }),
    execute: async ({ month }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const rows = await listMonthDocuments(month);
      return {
        ok: true,
        summary: { count: rows.length, unassigned: rows.filter((r) => !r.entryId).length },
        data: {
          documents: rows.map((r) => ({
            id: r.id,
            entryId: r.entryId,
            filename: r.filename,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
            uploadedAt: r.uploadedAt.toISOString(),
            uploadedBy: r.uploadedByName,
          })),
          url: "https://moje.begina.cz/rizeni-firmy/doklady",
        },
      };
    },
  }),
  defineTool({
    name: "economy_manage_document",
    title: "Doklady — přiřadit, odpojit nebo odebrat doklad",
    description:
      "ZÁPIS — úklid v Řízení firmy → Doklady: action=assign přiřadí doklad k řádku nákladu (entry_id, stejný měsíc), action=unassign ho od řádku odpojí, action=remove doklad odebere (měkce – soubor zůstává v úložišti a jde dohledat). document_id zjisti přes economy_list_documents. Odebírej jen doklad, který je prokazatelně špatný, duplicitní nebo nahrazený opraveným (např. stará faktura bez IČO), a důvod uveď v reason.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      document_id: { type: "string", description: "id dokladu (UUID) z economy_list_documents." },
      action: { type: "string", enum: ["assign", "unassign", "remove"], description: "assign = přiřadit k řádku, unassign = odpojit od řádku, remove = odebrat doklad." },
      entry_id: { type: "string", description: "Jen pro assign: id řádku nákladu (UUID) z economy_list_entries." },
      reason: { type: "string", description: "Proč (povinné u remove), např. „nahrazeno opravenou fakturou s IČO“." },
    },
    required: ["document_id", "action"],
    parse: (args) => {
      const documentId = requiredUuid(args, "document_id");
      const action = args.action;
      if (action !== "assign" && action !== "unassign" && action !== "remove") throw new ArgError("Argument action musí být assign, unassign nebo remove.");
      const entryId = action === "assign" ? requiredUuid(args, "entry_id") : null;
      const reason = action === "remove" ? requiredString(args, "reason", 300) : optionalString(args, "reason", 300);
      return { documentId, action, entryId, reason };
    },
    execute: async ({ documentId, action, entryId }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const result = action === "remove" ? await removeDocument(documentId) : await assignDocument(documentId, action === "assign" ? entryId : null);
      if (!result.ok) return result;
      return { ok: true, summary: { removed: action === "remove", assigned: action === "assign" }, data: { documentId, action, entryId, url: "https://moje.begina.cz/rizeni-firmy/doklady" } };
    },
  }),
  defineTool({
    name: "economy_attach_document",
    title: "Doklady — připojit PDF/fotku dokladu k nákladu",
    description:
      "ZÁPIS — připojí soubor dokladu (PDF nebo fotku účtenky, např. přílohu faktury z e-mailu) k jednomu řádku nákladu v Ekonomice; uvidí se v Řízení firmy → Doklady. " +
      "entry_id zjisti přes economy_list_entries (sloupec documents = kolik dokladů už má). Připojuj jen doklad, který k řádku prokazatelně patří (stejný prodávající, datum a částka). " +
      "Stejný soubor ke stejnému řádku se nezapíše dvakrát. Nic nemaže a částky nemění. Max. 20 MB. " +
      "Jen pro malé soubory (do pár kB) — PDF a fotky posílej přes economy_document_upload_link (soubor se nahraje mimo argument nástroje).",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      entry_id: { type: "string", description: "id řádku nákladu (UUID) z economy_list_entries." },
      filename: { type: "string", description: "Název souboru, např. faktura-makro-2026-11-11.pdf." },
      mime_type: { type: "string", enum: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"], description: "Typ souboru." },
      content_base64: { type: "string", description: "Obsah souboru v base64." },
    },
    required: ["entry_id", "filename", "mime_type", "content_base64"],
    parse: (args) => {
      const entryId = requiredUuid(args, "entry_id");
      const filename = requiredString(args, "filename", 200);
      const mimeType = requiredString(args, "mime_type", 40);
      const raw = typeof args.content_base64 === "string" ? args.content_base64.replace(/\s+/g, "") : "";
      if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new ArgError("Argument content_base64 musí být obsah souboru v base64.");
      const bytes = new Uint8Array(Buffer.from(raw, "base64"));
      return { entryId, filename, mimeType, bytes };
    },
    execute: async ({ entryId, filename, mimeType, bytes }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const result = await attachDocumentBytes({ entryId, filename, mimeType, bytes });
      if (!result.ok) return result;
      return {
        ok: true,
        summary: { attached: !result.duplicate },
        data: { documentId: result.id, duplicate: result.duplicate === true, url: "https://moje.begina.cz/rizeni-firmy/doklady" },
      };
    },
  }),
  defineTool({
    name: "economy_document_upload_link",
    title: "Doklady — odkaz pro nahrání PDF/fotky dokladu (velké soubory)",
    description:
      "ZÁPIS — místo economy_attach_document, když je soubor dokladu (PDF příloha faktury, fotka účtenky) moc velký na base64 v argumentu (tj. prakticky vždy u PDF). " +
      "Vydá jednorázový odkaz (platí 15 minut) vázaný na řádek nákladu, typ, velikost a SHA-256 otisk souboru. Soubor pak pošli přímo, např. z Bashe: " +
      "curl -sS -X POST --data-binary @soubor.pdf -H \"Content-Type: application/pdf\" \"<upload_url>\" — odpověď JSON řekne, zda se doklad připojil (attached) nebo už tam byl (duplicate). " +
      "size_bytes zjisti přes stat -c%s, sha256 přes sha256sum. Připojuj jen doklad, který k řádku prokazatelně patří (stejný prodávající, datum a částka). Nic nemaže a částky nemění. Max. 4 MB.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      entry_id: { type: "string", description: "id řádku nákladu (UUID) z economy_list_entries." },
      filename: { type: "string", description: "Název souboru, např. původní název přílohy faktura-20263175.pdf." },
      mime_type: { type: "string", enum: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"], description: "Typ souboru." },
      size_bytes: { type: "integer", description: "Velikost souboru v bajtech (stat -c%s soubor)." },
      sha256: { type: "string", description: "SHA-256 otisk souboru, 64 hex znaků (sha256sum soubor)." },
    },
    required: ["entry_id", "filename", "mime_type", "size_bytes", "sha256"],
    parse: (args) => {
      const entryId = requiredUuid(args, "entry_id");
      const filename = requiredString(args, "filename", 200);
      const mimeType = requiredString(args, "mime_type", 40);
      if (!extensionForMime(mimeType)) throw new ArgError("Argument mime_type musí být PDF nebo obrázek (JPG, PNG, WEBP, HEIC).");
      const sizeBytes = typeof args.size_bytes === "number" ? args.size_bytes : Number.NaN;
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > UPLOAD_MAX_BYTES) {
        throw new ArgError("Argument size_bytes musí být velikost souboru v bajtech (nejvýš 4 MB).");
      }
      const sha256 = typeof args.sha256 === "string" ? args.sha256.trim().toLowerCase() : "";
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ArgError("Argument sha256 musí být 64 hex znaků (výstup sha256sum).");
      return { entryId, filename, mimeType, sizeBytes, sha256 };
    },
    execute: async ({ entryId, filename, mimeType, sizeBytes, sha256 }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const [entry] = await db
        .select({ kind: economyEntries.kind, deletedAt: economyEntries.deletedAt })
        .from(economyEntries)
        .where(eq(economyEntries.id, entryId))
        .limit(1);
      if (!entry || entry.deletedAt) return { ok: false, error: "Řádek Ekonomiky nebyl nalezen." };
      let secret: string;
      try {
        secret = uploadLinkSecret();
      } catch {
        return { ok: false, error: "Nahrávání dokladů asistentem není na serveru nastavené." };
      }
      const issuedAt = Date.now();
      const token = signUploadLink(
        {
          userId: ctx.userId,
          systemRole: ctx.systemRole,
          uploaderName: `${ctx.name ?? ctx.email} (asistent)`,
          entryId,
          filename,
          mimeType,
          sizeBytes,
          sha256,
          issuedAt,
        },
        secret
      );
      const uploadUrl = `${await appOrigin()}/api/doklady/nahrat?token=${encodeURIComponent(token)}`;
      return {
        ok: true,
        summary: { linkIssued: true },
        data: {
          upload_url: uploadUrl,
          method: "POST",
          content_type: mimeType,
          expires_at: new Date(issuedAt + UPLOAD_LINK_MINUTES * 60_000).toISOString(),
          curl: `curl -sS -X POST --data-binary @<soubor> -H "Content-Type: ${mimeType}" "${uploadUrl}"`,
          note: "Odkaz platí jen pro soubor s touto velikostí a otiskem. Výsledek nahrání ověř v odpovědi (ok, attached, duplicate).",
        },
      };
    },
  }),
  defineTool({
    name: "economy_attach_email_document",
    title: "Doklady — připojit fakturu z textu e-mailu (bez PDF)",
    description:
      "ZÁPIS — pro faktury a účtenky, které přišly jen jako TEXT e-mailu bez PDF přílohy (např. Apple, některé e-shopy): server z textu e-mailu vytvoří PDF „Doklad převedený z e-mailu“ (odesílatel, datum, předmět a celý text) a připojí ho k řádku nákladu v Ekonomice — uvidí se v Řízení firmy → Doklady. " +
      "body_text = celý textový obsah e-mailu s fakturou (plaintextBody z Gmailu), nic nezkracuj ani neupravuj. Připojuj jen k řádku, ke kterému doklad prokazatelně patří (stejný prodávající, datum a částka). " +
      "Více e-mailů k jednomu nákladu (faktura + dobropis) spoj do body_text za sebou. Stejný doklad ke stejnému řádku se nezapíše dvakrát. Nic nemaže a částky nemění.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      entry_id: { type: "string", description: "id řádku nákladu (UUID) z economy_list_entries." },
      sender: { type: "string", description: "Odesílatel e-mailu, např. „Apple <no_reply@email.apple.com>“." },
      subject: { type: "string", description: "Předmět e-mailu." },
      received_at: { type: "string", description: "Kdy e-mail přišel, např. „20. 11. 2026 18:50“." },
      body_text: { type: "string", description: "Celý text e-mailu s fakturou (nejvýš 60 000 znaků)." },
      filename: { type: "string", description: "Název PDF, např. apple-claude-2026-11-20.pdf (nepovinné)." },
    },
    required: ["entry_id", "sender", "subject", "received_at", "body_text"],
    parse: (args) => {
      const entryId = requiredUuid(args, "entry_id");
      const bodyText = requiredString(args, "body_text", 60_000);
      const rawName = optionalString(args, "filename", 150);
      const base = (rawName ?? "doklad-z-emailu").replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "doklad-z-emailu";
      return {
        entryId,
        sender: requiredString(args, "sender", 300),
        subject: requiredString(args, "subject", 300),
        receivedAt: requiredString(args, "received_at", 100),
        bodyText,
        filename: `${base}.pdf`,
      };
    },
    execute: async ({ entryId, sender, subject, receivedAt, bodyText, filename }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const bytes = await emailDocumentPdf({ sender, subject, receivedAt, bodyText });
      const result = await attachDocumentBytes({ entryId, filename, mimeType: "application/pdf", bytes });
      if (!result.ok) return result;
      return {
        ok: true,
        summary: { attached: !result.duplicate },
        data: { documentId: result.id, duplicate: result.duplicate === true, filename, url: "https://moje.begina.cz/rizeni-firmy/doklady" },
      };
    },
  }),
  defineTool({
    name: "economy_add_entry",
    title: "Ekonomika — zapsat náklad nebo příjem",
    description:
      "ZÁPIS — přidá jeden řádek do Ekonomiky v MojeBegina: náklad (kind=cost: co se kupovalo, prodávající) nebo příjem (kind=income: typ, klient, forma úhrady, číslo faktury). Zapisuj jen údaje z dokladu nebo od uživatele, nic neodhaduj; částka je celková v Kč. Nejdřív přes economy_list_entries ověř, že řádek ještě neexistuje. Volej až po souhlasu uživatele s tím, co zapíšeš. Existující řádky nemění ani nemaže — na to jsou economy_update_entry a economy_delete_entry.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      kind: { type: "string", enum: ["cost", "income"], description: "cost = náklad, income = příjem." },
      date: { type: "string", description: "Datum dokladu RRRR-MM-DD." },
      title: { type: "string", description: "Náklad: co se kupovalo (např. „Zboží do bistra“). Příjem: typ (např. „Faktura“, „Tržby bistro“)." },
      counterparty: { type: "string", description: "Náklad: prodávající. Příjem: klient." },
      amount_kc: { type: "number", description: "Celková částka v Kč (kladná, nejvýš na haléře)." },
      amount_no_shipping_kc: { type: "number", description: "Jen příjem: cena bez dopravy v Kč (nepovinné)." },
      payment_form: { type: "string", description: `Jen příjem: forma úhrady (${PAYMENT_FORMS.join(", ")}; nepovinné).` },
      invoice_number: { type: "string", description: "Jen příjem: číslo faktury (nepovinné)." },
      note: { type: "string", description: "Poznámka, např. „není faktura“ (nepovinné)." },
    },
    required: ["kind", "date", "title", "amount_kc"],
    parse: (args) => {
      const kind = kindOf(args);
      const entryDate = parseEntryDate(requiredString(args, "date", 10));
      if (!entryDate) throw new ArgError("Argument date musí být platné datum RRRR-MM-DD.");
      const amountHal = parseAmountToHal(String(args.amount_kc ?? ""));
      if (amountHal === null) throw new ArgError("Argument amount_kc musí být kladná částka v Kč.");
      const rawNoShipping = args.amount_no_shipping_kc;
      const amountNoShippingHal = rawNoShipping === undefined || rawNoShipping === null ? null : parseAmountToHal(String(rawNoShipping));
      if (rawNoShipping !== undefined && rawNoShipping !== null && amountNoShippingHal === null) throw new ArgError("Argument amount_no_shipping_kc musí být kladná částka v Kč.");
      if (kind === "cost" && (amountNoShippingHal !== null || args.payment_form || args.invoice_number)) {
        throw new ArgError("U nákladu se nevyplňuje cena bez dopravy, forma úhrady ani číslo faktury — patří do poznámky.");
      }
      return {
        kind,
        entryDate,
        title: requiredString(args, "title", 300),
        counterparty: optionalString(args, "counterparty", 300),
        amountHal,
        amountNoShippingHal,
        paymentForm: optionalString(args, "payment_form", 60),
        invoiceNumber: optionalString(args, "invoice_number", 40),
        note: optionalString(args, "note", 500),
        key: idempotencyKey(args),
      };
    },
    execute: async ({ key, ...entry }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const inserted = await db
        .insert(economyEntries)
        .values({ ...entry, source: "agent", sourceRef: key, createdByUserId: ctx.userId })
        .onConflictDoNothing({ target: [economyEntries.source, economyEntries.sourceRef] })
        .returning({ id: economyEntries.id });
      return {
        ok: true,
        summary: { created: inserted.length > 0 },
        data: {
          created: inserted.length > 0,
          message: inserted.length > 0 ? `${entry.kind === "cost" ? "Náklad" : "Příjem"} ${entry.amountHal / 100} Kč (${entry.entryDate}, ${entry.title}) je zapsaný.` : "Tento zápis už dřív proběhl (stejný idempotency_key) — nic se nezapsalo podruhé.",
          url: ECONOMY_URL,
        },
      };
    },
  }),
  defineTool({
    name: "economy_update_entry",
    title: "Ekonomika — upravit náklad nebo příjem",
    description:
      "ZÁPIS — upraví jeden existující řádek Ekonomiky podle id (id vrací economy_list_entries). Pošli jen pole, která se mají změnit; prázdný text u nepovinného pole hodnotu smaže (např. note: \"\" smaže poznámku „není faktura“, když dorazila faktura). Stará i nová hodnota se zapíše do historie. Volej až po souhlasu uživatele s tím, co změníš.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      id: { type: "string", description: "id řádku (UUID) z economy_list_entries." },
      date: { type: "string", description: "Nové datum dokladu RRRR-MM-DD." },
      title: { type: "string", description: "Nový popis (náklad: co se kupovalo; příjem: typ)." },
      counterparty: { type: "string", description: "Prodávající / klient; prázdný text = smazat." },
      amount_kc: { type: "number", description: "Nová celková částka v Kč (kladná)." },
      amount_no_shipping_kc: { type: "number", description: "Jen příjem: cena bez dopravy v Kč." },
      payment_form: { type: "string", description: `Jen příjem: forma úhrady (${PAYMENT_FORMS.join(", ")}); prázdný text = smazat.` },
      invoice_number: { type: "string", description: "Jen příjem: číslo faktury; prázdný text = smazat." },
      note: { type: "string", description: "Poznámka; prázdný text = smazat poznámku." },
    },
    required: ["id"],
    parse: (args) => ({ id: requiredUuid(args, "id"), patch: parseEntryPatch(args) }),
    execute: async ({ id, patch }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await historyTableExists())) return { ok: false, error: NO_HISTORY };
      const row = await loadLiveEntry(id);
      if (!row) return { ok: false, error: "Řádek s tímto id v Ekonomice není (nebo už je smazaný). Najdi ho přes economy_list_entries." };
      if (row.kind === "cost" && (patch.amountNoShippingHal || patch.paymentForm || patch.invoiceNumber)) {
        return { ok: false, error: "U nákladu se nevyplňuje cena bez dopravy, forma úhrady ani číslo faktury — patří do poznámky." };
      }
      const changes: Record<string, { field: string; old: unknown; new: unknown }> = {};
      for (const field of Object.keys(patch) as EditableField[]) {
        if (row[field] !== patch[field]) changes[field] = { field: FIELD_LABELS[field], old: shown(field, row[field]), new: shown(field, patch[field]) };
      }
      if (Object.keys(changes).length === 0) {
        return { ok: true, summary: { updated: false }, data: { updated: false, message: "Řádek už tyto hodnoty má — nic se neměnilo.", entry: entryView(row), url: ECONOMY_URL } };
      }
      const set = Object.fromEntries(Object.keys(changes).map((field) => [field, patch[field as EditableField]])) as EntryPatch;
      const [updated] = await db.batch([
        db
          .update(economyEntries)
          .set({ ...set, updatedAt: new Date() })
          .where(and(eq(economyEntries.id, id), isNull(economyEntries.deletedAt)))
          .returning(),
        db.insert(economyEntryChanges).values({ entryId: id, action: "update", changes, source: "agent", changedByUserId: ctx.userId, changedByName: ctx.name }),
      ]);
      const after = updated[0] ?? { ...row, ...set };
      return {
        ok: true,
        summary: { updated: true },
        data: {
          updated: true,
          message: `Řádek ${row.entryDate} ${row.title} (${row.amountHal / 100} Kč) je upravený: ${Object.values(changes).map((c) => `${c.field} ${c.old ?? "—"} → ${c.new ?? "—"}`).join("; ")}.`,
          changes: Object.values(changes),
          entry: entryView(after),
          url: ECONOMY_URL,
        },
      };
    },
  }),
  defineTool({
    name: "economy_delete_entry",
    title: "Ekonomika — smazat náklad nebo příjem",
    description:
      "ZÁPIS — smaže jeden řádek Ekonomiky podle id (id vrací economy_list_entries). Důvod je povinný. Řádek se přestane počítat do součtu měsíce; celý jeho obsah a důvod zůstane v historii, takže jde vrátit. Volej až po souhlasu uživatele.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      id: { type: "string", description: "id řádku (UUID) z economy_list_entries." },
      reason: { type: "string", description: "Proč se řádek maže (povinné), např. „není firemní náklad“." },
    },
    required: ["id", "reason"],
    parse: (args) => ({ id: requiredUuid(args, "id"), reason: requiredString(args, "reason", 500) }),
    execute: async ({ id, reason }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await historyTableExists())) return { ok: false, error: NO_HISTORY };
      const row = await loadLiveEntry(id);
      if (!row) return { ok: false, error: "Řádek s tímto id v Ekonomice není (nebo už je smazaný). Najdi ho přes economy_list_entries." };
      const snapshot = Object.fromEntries(
        (Object.keys(FIELD_LABELS) as EditableField[]).map((field) => [field, { field: FIELD_LABELS[field], old: shown(field, row[field]), new: null }])
      );
      const now = new Date();
      await db.batch([
        db.update(economyEntries).set({ deletedAt: now, updatedAt: now }).where(and(eq(economyEntries.id, id), isNull(economyEntries.deletedAt))),
        db.insert(economyEntryChanges).values({ entryId: id, action: "delete", changes: { kind: row.kind, ...snapshot }, reason, source: "agent", changedByUserId: ctx.userId, changedByName: ctx.name }),
      ]);
      return {
        ok: true,
        summary: { deleted: true },
        data: {
          deleted: true,
          message: `${row.kind === "cost" ? "Náklad" : "Příjem"} ${row.entryDate} ${row.title} (${row.amountHal / 100} Kč) je smazaný a do součtu měsíce se už nepočítá. Důvod: ${reason}.`,
          entry: entryView(row),
          url: ECONOMY_URL,
        },
      };
    },
  }),
];
