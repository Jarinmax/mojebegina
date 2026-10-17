// Sestavení PDF balíčku (obchodní podmínky + poučení + formulář) z obsahu
// v bundle.ts. JEN pro skript scripts/eshop-legal/build-pdf.mts a testy —
// aplikace PDF negeneruje, posílá hotové neměnné soubory (versions.ts).
// Výstup je deterministický (pevná metadata a data), stejný obsah = stejné
// bajty; test hlídá, že uložená verze odpovídá generátoru.
import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InfoBlock } from "../infoPages";
import { SELLER } from "../seller";
import { legalBundleContent } from "./bundle";

const FONT_DIR = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf");
const PAGE = { width: 595.28, height: 841.89, margin: 56, bottom: 64 };
const SIZE = { title: 16, subtitle: 9.5, heading: 11.5, body: 9.5, footer: 7.5 };
const LEADING = 1.38;
const GREY = rgb(0.35, 0.35, 0.35);

type Fonts = { regular: PDFFont; bold: PDFFont };

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private fonts: Fonts
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  private ensure(height: number) {
    if (this.y - height < PAGE.bottom) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, opts: { size?: number; bold?: boolean; indent?: number; marker?: string; color?: ReturnType<typeof rgb>; gapAfter?: number } = {}) {
    const size = opts.size ?? SIZE.body;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    const x = PAGE.margin + indent;
    const lines = this.wrap(text, font, size, PAGE.width - PAGE.margin - x);
    const lineHeight = size * LEADING;
    lines.forEach((line, i) => {
      this.ensure(lineHeight);
      if (i === 0 && opts.marker) {
        // číslo / odrážka zarovnané doprava před text (i „10.“, „11.“)
        const markerX = x - 5 - this.fonts.regular.widthOfTextAtSize(opts.marker, size);
        this.page.drawText(opts.marker, { x: markerX, y: this.y - size, size, font: this.fonts.regular, color: opts.color });
      }
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color });
      this.y -= lineHeight;
    });
    this.y -= opts.gapAfter ?? 3;
  }

  /** Vodorovná linka k vyplnění (formulář). */
  fillLine(indent: number) {
    this.ensure(22);
    this.y -= 16;
    this.page.drawLine({
      start: { x: PAGE.margin + indent, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: GREY,
    });
    this.y -= 8;
  }

  gap(height: number) {
    this.y -= height;
  }

  block(block: InfoBlock, opts: { fillable?: boolean } = {}) {
    if (block.heading) {
      this.ensure(SIZE.heading * 3);
      this.gap(6);
      this.text(block.heading, { size: SIZE.heading, bold: true, gapAfter: 4 });
    }
    if (block.subheading) this.text(block.subheading, { bold: true });
    for (const p of block.paragraphs ?? []) this.text(p, { gapAfter: 4 });
    block.lines?.forEach((line, i) => this.text(line, { indent: 12, bold: i === 0, gapAfter: 1 }));
    if (block.lines) this.gap(3);
    for (const item of block.items ?? []) {
      this.text(item, { indent: 18, marker: block.itemStyle === "check" ? "✔" : "•" });
      if (opts.fillable) this.fillLine(18);
    }
    block.points?.forEach((point, i) => {
      this.text(point.text, { indent: 20, marker: `${i + 1}.` });
      point.lines?.forEach((line, j) => this.text(line, { indent: 32, bold: j === 0, gapAfter: 1 }));
      for (const item of point.items ?? []) this.text(item, { indent: 34, marker: "•", gapAfter: 1 });
      if (point.after) this.text(point.after, { indent: 20 });
    });
    for (const p of block.afterParagraphs ?? []) this.text(p, { gapAfter: 4 });
  }
}

/** Datum účinnosti verze (ISO) → pevné datum v metadatech PDF (determinismus). */
function fixedDate(versionId: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(versionId)?.[0];
  if (!iso) throw new Error(`Verze dokumentu musí začínat datem RRRR-MM-DD: ${versionId}`);
  return new Date(`${iso}T00:00:00Z`);
}

export async function buildLegalPdf(versionId: string): Promise<Uint8Array> {
  const content = legalBundleContent(versionId);
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(readFileSync(path.join(FONT_DIR, "DejaVuSans.ttf")), { subset: true }),
    bold: await doc.embedFont(readFileSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")), { subset: true }),
  };
  const when = fixedDate(versionId);
  doc.setTitle(`${content.title} — verze ${versionId}`);
  doc.setAuthor(SELLER.name);
  doc.setSubject("Obchodní podmínky, poučení o odstoupení od smlouvy a vzorový formulář");
  doc.setCreator("E-shop Begina.cz");
  doc.setProducer("E-shop Begina.cz");
  doc.setLanguage("cs-CZ");
  doc.setCreationDate(when);
  doc.setModificationDate(when);

  const writer = new Writer(doc, fonts);
  content.sections.forEach((section, i) => {
    if (i > 0) writer.newPage();
    writer.text(section.title, { size: SIZE.title, bold: true, gapAfter: 2 });
    if (section.subtitle) writer.text(section.subtitle, { size: SIZE.subtitle, color: GREY, gapAfter: 8 });
    const fillable = i === content.sections.length - 1; // vzorový formulář
    for (const block of section.blocks) writer.block(block, { fillable });
  });

  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = `${content.footer} · strana ${i + 1} z ${pages.length}`;
    page.drawText(label, { x: PAGE.margin, y: 32, size: SIZE.footer, font: fonts.regular, color: GREY });
  });
  return doc.save({ useObjectStreams: false });
}
