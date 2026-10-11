// Sklad 1.0 — lokální náhled přípravy obrázku PŘED OCR, BEZE VŠEHO AI.
//
// Spustí nad lokální fotkou PŘESNĚ tu samou funkci
// (lib/data/receiptImagePreprocessing.ts → preprocessReceiptPage), kterou
// nad fotkami z Blobu volá skladExtraction.ts těsně PŘED OCR fází. Uloží:
//   - diagnostics.json — stejná bezpečná diagnostika, co appka loguje do
//     Vercel Runtime Logs (originalWidth/Height, crop, bandDimensions),
//   - crop-preview.jpg — kopie originálu s červeným obdélníkem okolo
//     nalezeného ořezu (nebo poznámka, že appka ořez přeskočila),
//   - band-N.jpg — KAŽDÝ výřez přesně tak, jak by ho dostal OCR model
//     (po ořezu, normalizaci kontrastu a doostření, případně rozdělení).
//
// ŽÁDNÉ volání AI Gateway, žádná síť, žádná databáze — jen sharp nad
// lokálním souborem. Bezpečné spustit opakovaně bez nákladů.
//
// Použití:
//   node --experimental-strip-types scripts/sklad-receipt-preview/preview.mts <cesta-k-fotce.jpg> [výstupní-složka]
//
// Když výstupní složku nezadáte, appka ji založí vedle fotky jako
// "<jméno-fotky>-preview/". Node při spuštění vypíše neškodné varování
// "MODULE_TYPELESS_PACKAGE_JSON" (package.json appky nemá "type":
// "module") — appka ho ignoruje, nejde o chybu.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { preprocessReceiptPage } from "../../lib/data/receiptImagePreprocessing.ts";

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg"; // appka v produkci stejně vždy dostane JPEG (klient HEIC/velké fotky vždy převede, viz lib/sklad/clientUpload.ts)
}

async function drawCropOverlay(originalBytes: Buffer, crop: { left: number; top: number; width: number; height: number } | null): Promise<Buffer> {
  const meta = await sharp(originalBytes, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height || !crop) {
    return sharp(originalBytes, { failOn: "none" }).toBuffer();
  }
  const strokeWidth = Math.max(4, Math.round(Math.min(width, height) * 0.004));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${crop.left}" y="${crop.top}" width="${crop.width}" height="${crop.height}"
          fill="none" stroke="red" stroke-width="${strokeWidth}" />
  </svg>`;
  return sharp(originalBytes, { failOn: "none" })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg()
    .toBuffer();
}

async function main() {
  const [, , photoPathArg, outDirArg] = process.argv;
  if (!photoPathArg) {
    console.error("Použití: node --experimental-strip-types scripts/sklad-receipt-preview/preview.mts <cesta-k-fotce.jpg> [výstupní-složka]");
    process.exit(1);
  }
  const photoPath = path.resolve(photoPathArg);
  if (!existsSync(photoPath)) {
    console.error(`Fotka nenalezena: ${photoPath}`);
    process.exit(1);
  }
  const outDir = path.resolve(outDirArg ?? `${photoPath.replace(/\.[^.]+$/, "")}-preview`);
  await mkdir(outDir, { recursive: true });

  const bytes = await readFile(photoPath);
  const mimeType = detectMimeType(photoPath);
  console.log(`[preview] Vstup: ${photoPath} (${bytes.length} bajtů, ${mimeType})`);

  const result = await preprocessReceiptPage({ mimeType, bytes });

  console.log(`[preview] Diagnostika:`, JSON.stringify(result.diagnostics, null, 2));
  await writeFile(path.join(outDir, "diagnostics.json"), JSON.stringify(result.diagnostics, null, 2));

  const overlay = await drawCropOverlay(bytes, result.diagnostics.crop);
  await writeFile(path.join(outDir, "crop-preview.jpg"), overlay);
  console.log(
    result.diagnostics.crop
      ? `[preview] crop-preview.jpg uložen — červený obdélník ukazuje nalezený ořez (left=${result.diagnostics.crop.left}, top=${result.diagnostics.crop.top}, width=${result.diagnostics.crop.width}, height=${result.diagnostics.crop.height}).`
      : `[preview] crop-preview.jpg uložen — appka ořez PŘESKOČILA (crop: null), žádný obdélník.`
  );

  for (let i = 0; i < result.images.length; i += 1) {
    const bandPath = path.join(outDir, `band-${i + 1}.jpg`);
    await writeFile(bandPath, result.images[i].bytes);
    const dims = result.diagnostics.bandDimensions[i];
    console.log(`[preview] ${path.basename(bandPath)} uložen (${dims?.width}×${dims?.height}) — přesně tohle by dostal OCR model jako výřez č. ${i + 1}.`);
  }

  console.log(`\n[preview] Hotovo. Výstup: ${outDir}`);
  console.log(`[preview] Žádné volání AI Gateway, žádná síť — jen lokální zpracování obrázku.`);
}

main().catch((error) => {
  console.error("[preview] Chyba:", error);
  process.exit(1);
});
