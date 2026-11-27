// Šarže → etiketa (Lucie 21. 11. 2026, krok 2): do hotové etikety složení
// (public/etikety/…) se dopíše číslo šarže a datum spotřeby za „Šarže:“
// a „Spotřebujte do:“. Řádek se najde v obrázku sám: je to poslední řádek
// textu nad logy (etikety mají jednotné rozvržení 1420 × 696 px).
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { ETIKETY_MANIFEST } from "@/lib/etikety/manifest";
import { BEGINA_PDF_SANS_BOLD } from "@/lib/eshop/legal/fonts/beginaPdfSans";
import { formatCzDate } from "./batches";

const FOLDERS: Record<string, (volumeMl: number) => string | null> = {
  polevky: (v) => (v === 3000 ? "polevky/slozeni" : null),
  caje: (v) => (v === 3000 ? "caje/slozeni" : null),
  "ovocne-napoje": (v) => (v === 3000 ? "ovocne-napoje/slozeni" : null),
  sirupy: (v) => (v === 3000 ? "sirupy/3l" : v === 650 ? "sirupy/650ml" : v === 100 ? "sirupy/100ml" : null),
  koktejly: (v) => (v === 3000 ? "alkoholicke-koktejly/3l" : v === 500 ? "alkoholicke-koktejly/500ml" : null),
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Cesta etikety složení (relativně k /etikety/), nebo null, když pro balení etiketa není. */
export function resolveLabelFile(categorySlug: string, productSlug: string, productName: string, volumeMl: number): string | null {
  const folder = FOLDERS[categorySlug]?.(volumeMl);
  if (!folder) return null;
  const files = ETIKETY_MANIFEST[folder] ?? [];
  const wanted = new Set([normalize(productSlug), normalize(productName)]);
  const file = files.find((f) => wanted.has(normalize(f.replace(/\.[a-z0-9]+$/i, ""))));
  return file ? `${folder}/${file}` : null;
}

export type BatchLinePosition = { top: number; bottom: number; labelEnd: number; secondStart: number; secondEnd: number };

/** Najde řádek „Šarže: … Spotřebujte do:“ v šedotónovém obrázku. */
export function findBatchLine(gray: Uint8Array, width: number, height: number): BatchLinePosition | null {
  const DARK = 110;
  const rowDark: boolean[] = [];
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (gray[y * width + x] < DARK) n++;
    rowDark.push(n > 2);
  }
  const bands: Array<[number, number]> = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    if (rowDark[y] && start < 0) start = y;
    if (!rowDark[y] && start >= 0) {
      bands.push([start, y]);
      start = -1;
    }
  }
  if (start >= 0) bands.push([start, height]);
  if (bands.length < 2) return null;
  const tallest = bands.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const before = bands.filter((b) => b[1] <= tallest[0]);
  const line = before[before.length - 1];
  if (!line || line[1] - line[0] > 40) return null;
  const segs: Array<[number, number]> = [];
  let s = -1;
  let last = -100;
  for (let x = 0; x < width; x++) {
    let dark = false;
    for (let y = line[0]; y < line[1]; y++) if (gray[y * width + x] < DARK) { dark = true; break; }
    if (!dark) continue;
    if (s < 0) s = x;
    else if (x - last > 25) {
      segs.push([s, last]);
      s = x;
    }
    last = x;
  }
  if (s >= 0) segs.push([s, last]);
  if (segs.length !== 2) return null;
  return { top: line[0], bottom: line[1], labelEnd: segs[0][1], secondStart: segs[1][0], secondEnd: segs[1][1] };
}

/** Text jako křivky (SVG path) tučným písmem Beginy — sharp/librsvg nepotřebuje nainstalovaný font. */
function textPath(text: string, x: number, baseline: number, sizePx: number): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const font: any = (fontkit as any).create(Buffer.from(BEGINA_PDF_SANS_BOLD, "base64"));
  const run = font.layout(text);
  const s = sizePx / font.unitsPerEm;
  let cx = 0;
  const parts: string[] = [];
  run.glyphs.forEach((g: { path: { toSVG(): string } }, i: number) => {
    const p = run.positions[i];
    const d = g.path.toSVG();
    if (d) parts.push(`<path transform="translate(${(x + (cx + p.xOffset) * s).toFixed(2)} ${(baseline - p.yOffset * s).toFixed(2)}) scale(${s.toFixed(5)} ${(-s).toFixed(5)})" d="${d}"/>`);
    cx += p.xAdvance;
  });
  return parts.join("");
}

/**
 * PNG etikety se šarží (Jarin 27. 11. 2026): stejný obrázek jako „Stáhnout“ v Etiketách
 * (1420 × 696 = 120 × 58 mm při 300 dpi), jen s dopsanou šarží a datem. P-touch Editor
 * (QL-800) PNG vloží 1 : 1 jako vždycky; PDF si převádí na hrubý rastr a text je nečitelný.
 */
export async function buildBatchLabelPng(png: Uint8Array, code: string, bestBefore: string | null): Promise<Buffer | null> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const pos = findBatchLine(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
  if (!pos) return null;
  const size = Math.max(pos.bottom - pos.top, 24) * 1.2;
  const baseline = pos.bottom - 1;
  let paths = textPath(code, pos.labelEnd + 14, baseline, size);
  if (bestBefore) paths += textPath(formatCzDate(bestBefore), pos.secondEnd + 14, baseline, size);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><g fill="#000">${paths}</g></svg>`;
  return sharp(png)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

/** PDF etiket k tisku: tolik stran, kolik kusů (nejvýš 60), na každé číslo šarže a datum spotřeby. */
export async function buildBatchLabelPdf(png: Uint8Array, code: string, bestBefore: string | null, copies: number): Promise<Uint8Array | null> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const pos = findBatchLine(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
  if (!pos) return null;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bold = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_BOLD, "base64"), { subset: true });
  const image = await doc.embedPng(png);
  // 120 mm na šířku (role 62 mm, etiketa 58 × 120 mm); výška podle poměru obrázku
  const mm = 72 / 25.4;
  const pageW = 120 * mm;
  const scale = pageW / info.width;
  const pageH = info.height * scale;
  const size = Math.max(pos.bottom - pos.top, 24) * 1.2 * scale;
  const baseline = pageH - pos.bottom * scale + 0.5;
  const pages = Math.max(1, Math.min(60, Math.floor(copies)));
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
    page.drawText(code, { x: (pos.labelEnd + 14) * scale, y: baseline, size, font: bold, color: rgb(0, 0, 0) });
    if (bestBefore) page.drawText(formatCzDate(bestBefore), { x: (pos.secondEnd + 14) * scale, y: baseline, size, font: bold, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
