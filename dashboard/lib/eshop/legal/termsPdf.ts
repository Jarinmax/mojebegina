// PDF obchodních podmínek (včetně přílohy s formulářem pro odstoupení) pro
// dané znění — příloha potvrzovacího e-mailu a soubor ke stažení
// (/obchodni-podminky/<id>.pdf).
//
// DETERMINISTICKÉ: stejné znění = vždy stejné bajty (pevná data v metadatech,
// pdf-lib má pevně nasazený generátor náhodných čísel, font bez náhodného
// sufixu). Otisk SHA-256 PDF se zapisuje do historie objednávky a test ho
// u každého znění hlídá — zákazníkovi tak jde přesně to PDF, které odpovídá
// znění, se kterým souhlasil, a dá se kdykoli znovu vytvořit bajt po bajtu.
import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InfoBlock } from "../infoPages";
import { DELIVERY_ADDRESS, OPERATOR } from "../operator";
import { termsPdfFilename, type TermsVersion } from "../content/termsVersions";
import { WITHDRAWAL_FORM_PDF_FILENAME, WITHDRAWAL_FORM_TITLE } from "../content/withdrawalForm";
import { BEGINA_PDF_SANS_BOLD, BEGINA_PDF_SANS_REGULAR } from "./fonts/beginaPdfSans";

export type TermsPdf = {
  versionId: string;
  filename: string;
  bytes: Uint8Array;
  contentBase64: string;
  sha256: string;
};

export const TERMS_TITLE = "Obchodní podmínky e-shopu Begina.cz";

// --- Obsah jako řádky (společné pro PDF i textový otisk) ------------------

type Style = "title" | "subtitle" | "heading" | "subheading" | "body" | "note";
/** Jeden odstavec dokumentu: styl, odsazení (pt), značka (číslo bodu / odrážka) a text. */
export type DocLine =
  | { kind: "text"; style: Style; text: string; indent: number; marker?: string }
  | { kind: "fill"; lines: number } // linky pro vyplnění (formulář)
  | { kind: "space"; pt: number }
  | { kind: "pageBreak" };

const FORM_HEADING = "Příloha:";

/** Znění → posloupnost odstavců. Formulář (blok „Příloha: …“) na nové stránce s linkami k vyplnění. */
export function termsDocument(version: TermsVersion): DocLine[] {
  const out: DocLine[] = [
    { kind: "text", style: "title", text: TERMS_TITLE, indent: 0 },
    { kind: "text", style: "subtitle", text: `Platné a účinné od ${version.effectiveLabel} (znění ${version.id})`, indent: 0 },
    // 1. a 2. vydání: záhlaví beze změny (otisk PDF už platného znění)
    ...(version.edition >= 3
      ? ([
          {
            kind: "text",
            style: "subtitle",
            text: `Prodávající: ${OPERATOR.name}, IČO ${OPERATOR.ico}, sídlo a fakturační adresa: ${OPERATOR.address}, ${OPERATOR.email}, ${OPERATOR.phone}`,
            indent: 0,
          },
          {
            kind: "text",
            style: "subtitle",
            text: `Doručovací adresa (odstoupení, reklamace, vrácené zboží): ${DELIVERY_ADDRESS.oneLine}`,
            indent: 0,
          },
        ] satisfies DocLine[])
      : ([
          {
            kind: "text",
            style: "subtitle",
            text: `Prodávající: ${OPERATOR.name}, IČO ${OPERATOR.ico}, ${OPERATOR.address}, ${OPERATOR.email}, ${OPERATOR.phone}`,
            indent: 0,
          },
        ] satisfies DocLine[])),
    { kind: "space", pt: 10 },
  ];
  for (const block of version.blocks) out.push(...blockLines(block));
  return out;
}

function blockLines(block: InfoBlock, options: { standaloneForm?: boolean } = {}): DocLine[] {
  const form = options.standaloneForm === true || (block.heading?.startsWith(FORM_HEADING) ?? false);
  const out: DocLine[] = [];
  if (form && !options.standaloneForm) out.push({ kind: "pageBreak" });
  if (block.heading) out.push({ kind: "space", pt: 6 }, { kind: "text", style: "heading", text: block.heading, indent: 0 });
  if (block.subheading) out.push({ kind: "text", style: "subheading", text: block.subheading, indent: 0 });
  for (const p of block.paragraphs ?? []) out.push({ kind: "text", style: "body", text: p, indent: 0 });
  for (const l of block.lines ?? []) out.push({ kind: "text", style: "body", text: l, indent: 12 });
  for (const item of block.items ?? []) {
    out.push({ kind: "text", style: "body", text: item, indent: 14, marker: "–" });
    // formulář: místo na vyplnění u polí končících dvojtečkou (u výčtu zboží víc řádků)
    if (form && item.endsWith(":")) {
      const lines = item.startsWith("Oznamuji") ? (options.standaloneForm ? 4 : 3) : item.startsWith("Adresa") && options.standaloneForm ? 2 : 1;
      out.push({ kind: "fill", lines });
    }
  }
  (block.points ?? []).forEach((point, i) => {
    out.push({ kind: "text", style: "body", text: point.text, indent: 18, marker: `${i + 1}.` });
    for (const l of point.lines ?? []) out.push({ kind: "text", style: "body", text: l, indent: 30 });
    for (const item of point.items ?? []) out.push({ kind: "text", style: "body", text: item, indent: 30, marker: "–" });
    if (point.after) out.push({ kind: "text", style: "body", text: point.after, indent: 18 });
  });
  for (const p of block.afterParagraphs ?? []) out.push({ kind: "text", style: form ? "note" : "body", text: p, indent: 0 });
  return out;
}

/** Znění jako prostý text (pro otisk a pro kontrolu obsahu PDF). */
export function termsPlainText(version: TermsVersion): string {
  return plainText(termsDocument(version));
}

function plainText(lines: DocLine[]): string {
  return lines
    .map((line) => {
      if (line.kind === "text") return `${" ".repeat(line.indent / 6)}${line.marker ? `${line.marker} ` : ""}${line.text}`;
      if (line.kind === "fill") return "____".repeat(line.lines);
      if (line.kind === "pageBreak") return "\f";
      return "";
    })
    .join("\n");
}

export function termsTextSha256(version: TermsVersion): string {
  return createHash("sha256").update(termsPlainText(version), "utf8").digest("hex");
}

// --- Sazba ----------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 60;
const TEXT_WIDTH = A4[0] - 2 * MARGIN_X;

const STYLES: Record<Style, { size: number; bold: boolean; gray: boolean; gapBefore: number; lineHeight: number }> = {
  title: { size: 17, bold: true, gray: false, gapBefore: 0, lineHeight: 1.25 },
  subtitle: { size: 9, bold: false, gray: true, gapBefore: 3, lineHeight: 1.35 },
  heading: { size: 12, bold: true, gray: false, gapBefore: 6, lineHeight: 1.3 },
  subheading: { size: 10.5, bold: true, gray: false, gapBefore: 4, lineHeight: 1.3 },
  body: { size: 9.5, bold: false, gray: false, gapBefore: 3.5, lineHeight: 1.4 },
  note: { size: 8.5, bold: false, gray: true, gapBefore: 6, lineHeight: 1.35 },
};

/** Zalomení do šířky (slova; příliš dlouhé slovo po znacích). */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) out.push(line);
    line = "";
    let rest = word;
    while (!fits(rest)) {
      let n = rest.length - 1;
      while (n > 1 && !fits(rest.slice(0, n))) n -= 1;
      out.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** Znaky textu, které font nemá (vykreslily by se jako prázdný čtverec). */
export function missingGlyphs(text: string, font: PDFFont): string[] {
  const have = new Set(font.getCharacterSet());
  return [...new Set([...text].filter((ch) => !/\s/.test(ch) && !have.has(ch.codePointAt(0)!)))];
}

type RenderMeta = { header: string; title: string; subject: string; fixedDate: Date };

async function render(version: TermsVersion): Promise<Uint8Array> {
  return renderDocument(termsDocument(version), {
    header: `Begina.cz — obchodní podmínky, znění účinné od ${version.effectiveLabel}`,
    title: `${TERMS_TITLE} (znění účinné od ${version.effectiveLabel})`,
    subject: version.withWithdrawalForm ? "Obchodní podmínky včetně vzorového formuláře pro odstoupení od smlouvy" : "Obchodní podmínky",
    fixedDate: new Date(`${version.id}T00:00:00Z`),
  });
}

async function renderDocument(lines: DocLine[], meta: RenderMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_REGULAR, "base64"), {
    subset: true,
    customName: "BeginaPDFSans-Regular",
  });
  const bold = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_BOLD, "base64"), {
    subset: true,
    customName: "BeginaPDFSans-Bold",
  });

  const missing = missingGlyphs(plainText(lines), regular);
  if (missing.length > 0) throw new Error(`Font PDF nemá znaky: ${missing.join(" ")}`);

  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.38, 0.38, 0.38);
  const pages: PDFPage[] = [];
  let page = doc.addPage(A4);
  pages.push(page);
  let y = A4[1] - MARGIN_TOP;
  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    y = A4[1] - MARGIN_TOP;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) newPage();
  };

  for (const line of lines) {
    if (line.kind === "pageBreak") {
      newPage();
      continue;
    }
    if (line.kind === "space") {
      y -= line.pt;
      continue;
    }
    if (line.kind === "fill") {
      for (let i = 0; i < line.lines; i += 1) {
        ensure(22);
        y -= 20;
        page.drawLine({
          start: { x: MARGIN_X + 14, y },
          end: { x: MARGIN_X + TEXT_WIDTH, y },
          thickness: 0.5,
          color: gray,
          dashArray: [1.5, 2],
        });
      }
      y -= 6;
      continue;
    }
    const style = STYLES[line.style];
    const font = style.bold ? bold : regular;
    const leading = style.size * style.lineHeight;
    const wrapped = wrapText(line.text, font, style.size, TEXT_WIDTH - line.indent);
    // nadpis nezůstane osamocený na konci stránky
    ensure(style.gapBefore + leading * Math.min(wrapped.length, line.style === "heading" ? 3 : 1));
    y -= style.gapBefore;
    wrapped.forEach((text, i) => {
      ensure(leading);
      y -= leading;
      if (i === 0 && line.marker) {
        page.drawText(line.marker, { x: MARGIN_X + line.indent - 14, y, size: style.size, font, color: black });
      }
      page.drawText(text, { x: MARGIN_X + line.indent, y, size: style.size, font, color: style.gray ? gray : black });
    });
  }

  // záhlaví a čísla stran
  const header = meta.header;
  pages.forEach((p, i) => {
    if (i > 0) p.drawText(header, { x: MARGIN_X, y: A4[1] - 36, size: 7.5, font: regular, color: gray });
    const label = `Strana ${i + 1} z ${pages.length}`;
    p.drawText(label, {
      x: A4[0] - MARGIN_X - regular.widthOfTextAtSize(label, 7.5),
      y: 32,
      size: 7.5,
      font: regular,
      color: gray,
    });
  });

  const fixedDate = meta.fixedDate;
  doc.setTitle(meta.title);
  doc.setAuthor(`${OPERATOR.name}, Begina.cz`);
  doc.setSubject(meta.subject);
  doc.setLanguage("cs-CZ");
  doc.setCreator("MojeBegina");
  doc.setProducer("MojeBegina (pdf-lib)");
  doc.setCreationDate(fixedDate);
  doc.setModificationDate(fixedDate);
  return doc.save({ useObjectStreams: false });
}

const cache = new Map<string, Promise<TermsPdf>>();

/** PDF daného znění (v rámci jednoho běhu serveru se vytvoří jen jednou). */
export function termsPdf(version: TermsVersion): Promise<TermsPdf> {
  let pending = cache.get(version.id);
  if (!pending) {
    pending = render(version).then((bytes) => ({
      versionId: version.id,
      filename: termsPdfFilename(version),
      bytes,
      contentBase64: Buffer.from(bytes).toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }));
    // chyba se neukládá — příští pokus to zkusí znovu
    pending.catch(() => cache.delete(version.id));
    cache.set(version.id, pending);
  }
  return pending;
}

// --- Samostatný formulář pro odstoupení (PDF ke stažení a tisku) ----------

/** Formulář z přílohy daného znění (od 3. vydání) jako samostatný dokument na jednu stranu A4. */
export function withdrawalFormDocument(version: TermsVersion): DocLine[] {
  const block = version.blocks.find((b) => b.heading?.startsWith(FORM_HEADING));
  if (!block) throw new Error(`Znění ${version.id} nemá formulář pro odstoupení.`);
  return [
    { kind: "text", style: "title", text: WITHDRAWAL_FORM_TITLE, indent: 0 },
    {
      kind: "text",
      style: "subtitle",
      text: `Begina.cz — příloha obchodních podmínek (znění účinné od ${version.effectiveLabel}). Vzor podle nařízení vlády č. 29/2023 Sb.`,
      indent: 0,
    },
    { kind: "space", pt: 8 },
    ...blockLines({ ...block, heading: undefined }, { standaloneForm: true }),
  ];
}

export function withdrawalFormPlainText(version: TermsVersion): string {
  return plainText(withdrawalFormDocument(version));
}

const formCache = new Map<string, Promise<TermsPdf>>();

/** PDF formuláře pro odstoupení k danému znění (deterministické jako PDF podmínek). */
export function withdrawalFormPdf(version: TermsVersion): Promise<TermsPdf> {
  let pending = formCache.get(version.id);
  if (!pending) {
    pending = renderDocument(withdrawalFormDocument(version), {
      header: `Begina.cz — ${WITHDRAWAL_FORM_TITLE.toLowerCase()}`,
      title: `${WITHDRAWAL_FORM_TITLE} — Begina.cz`,
      subject: "Vzorový formulář pro odstoupení od kupní smlouvy (nařízení vlády č. 29/2023 Sb.)",
      fixedDate: new Date(`${version.id}T00:00:00Z`),
    }).then((bytes) => ({
      versionId: version.id,
      filename: WITHDRAWAL_FORM_PDF_FILENAME,
      bytes,
      contentBase64: Buffer.from(bytes).toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }));
    pending.catch(() => formCache.delete(version.id));
    formCache.set(version.id, pending);
  }
  return pending;
}
