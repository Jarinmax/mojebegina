// Mobilní tok 1.0 — příprava fotek účtenky PŘED odesláním modelu (oprava
// po prvním ostrém testu: "oprav AI vytěžení bez požadavku na nové
// focení" — appka pracuje jen s originálními bajty už uloženými v
// privátním Blobu, žádné nové focení se nevyžaduje). Čistá obrazová
// logika (sharp), bez DB/auth/síťového I/O — testovatelná přímo se
// syntetickými obrázky, stejný princip jako skladValidation.ts. Volá se
// z skladExtraction.ts (fetchReceiptPageImages) PŘED extractReceiptData,
// ne uvnitř receiptExtractionModel.ts (ten zůstává jen "samotné volání
// modelu" — izolovaný I/O na okraji, viz komentář v tom souboru).
//
// Tři kroky, v tomhle pořadí:
//   1. Ořez světlé účtenky z tmavého pozadí — jas okrajového pruhu snímku
//      se bere jako odhad pozadí, hledá se ohraničující obdélník pixelů
//      výrazně jasnějších než tenhle odhad.
//   2. Normalizace kontrastu (sharp .normalize()) + doostření (.sharpen()).
//   3. Rozdělení dlouhé (úzké) účtenky na překrývající se vodorovné výřezy
//      shora dolů — jen když je doklad výrazně vyšší než širší a nad
//      prahovou výškou, jinak se posílá jako jeden snímek (žádné zbytečné
//      množení nákladů na krátkých dokladech).
//
// Celý pipeline BEZPEČNĚ DEGRADUJE: jakákoli chyba (poškozený/neznámý
// formát, nedekódovatelný obrázek, neočekávaná výjimka ze sharp) vrátí
// PŮVODNÍ bajty beze změny jako jediný výřez, nikdy nevyhodí výjimku ven —
// příprava obrázku nesmí shodit celé vytěžení. Stejně tak nejistá/málo
// průkazná detekce ořezu (žádná hranice, nebo ořez skoro celého snímku)
// radši nic neořízne, než aby omylem uřízla kus účtenky.
import sharp from "sharp";
import type { ReceiptImageInput } from "./receiptExtractionModel";

const BACKGROUND_MARGIN_PX = 6;
const BRIGHTNESS_MARGIN = 35;
const ANALYSIS_MAX_DIMENSION = 240;
const CROP_PADDING_FRACTION = 0.02;
const MIN_CROP_AREA_FRACTION = 0.1;
const MAX_CROP_AREA_FRACTION = 0.98;

export const SPLIT_MIN_HEIGHT_PX = 2400;
export const SPLIT_MIN_ASPECT_RATIO = 2.2;
export const SPLIT_BAND_HEIGHT_PX = 1400;
export const SPLIT_OVERLAP_PX = 220;

type CropBox = { left: number; top: number; width: number; height: number };

// Najde ohraničující obdélník světlé účtenky na zmenšeném šedotónovém
// náhledu (kvůli rychlosti), výsledek přepočítá zpět na plné rozlišení.
// Vrací null, když detekce není dost průkazná — appka pak ořez přeskočí.
async function detectReceiptCropBox(bytes: Buffer): Promise<CropBox | null> {
  const source = sharp(bytes, { failOn: "none" });
  const metadata = await source.metadata();
  const fullWidth = metadata.width;
  const fullHeight = metadata.height;
  if (!fullWidth || !fullHeight) {
    return null;
  }

  const scale = Math.min(1, ANALYSIS_MAX_DIMENSION / Math.max(fullWidth, fullHeight));
  const thumbWidth = Math.max(1, Math.round(fullWidth * scale));
  const thumbHeight = Math.max(1, Math.round(fullHeight * scale));

  const { data, info } = await source
    .clone()
    .resize(thumbWidth, thumbHeight, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  if (width < 3 || height < 3) {
    return null;
  }

  const margin = Math.max(1, Math.min(BACKGROUND_MARGIN_PX, Math.floor(Math.min(width, height) / 4)));
  let backgroundSum = 0;
  let backgroundCount = 0;
  for (let y = 0; y < height; y += 1) {
    const isBorderRow = y < margin || y >= height - margin;
    for (let x = 0; x < width; x += 1) {
      if (isBorderRow || x < margin || x >= width - margin) {
        backgroundSum += data[y * width + x];
        backgroundCount += 1;
      }
    }
  }
  if (backgroundCount === 0) {
    return null;
  }
  const threshold = backgroundSum / backgroundCount + BRIGHTNESS_MARGIN;

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return null; // nic nepřesáhlo práh — jednolitý/příliš tmavý snímek
  }

  const scaleX = fullWidth / width;
  const scaleY = fullHeight / height;
  const padX = Math.round(fullWidth * CROP_PADDING_FRACTION);
  const padY = Math.round(fullHeight * CROP_PADDING_FRACTION);

  const left = Math.max(0, Math.round(minX * scaleX) - padX);
  const top = Math.max(0, Math.round(minY * scaleY) - padY);
  const right = Math.min(fullWidth, Math.round((maxX + 1) * scaleX) + padX);
  const bottom = Math.min(fullHeight, Math.round((maxY + 1) * scaleY) + padY);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  const fullArea = fullWidth * fullHeight;
  const cropArea = cropWidth * cropHeight;
  if (cropArea < fullArea * MIN_CROP_AREA_FRACTION) {
    return null; // podezřele malá detekce (např. jen odlesk) — radši neořezávat
  }
  if (cropArea >= fullArea * MAX_CROP_AREA_FRACTION) {
    return null; // detekce nenašla nic užitečného k odříznutí
  }

  return { left, top, width: cropWidth, height: cropHeight };
}

async function cropToReceipt(bytes: Buffer): Promise<Buffer> {
  try {
    const box = await detectReceiptCropBox(bytes);
    if (!box) {
      return bytes;
    }
    return await sharp(bytes, { failOn: "none" }).extract(box).toBuffer();
  } catch {
    return bytes;
  }
}

async function normalizeAndSharpen(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes, { failOn: "none" }).normalize().sharpen().toBuffer();
  } catch {
    return bytes;
  }
}

// Čistá aritmetika: vrátí `top` souřadnice výřezů pokrývajících `height`
// shora dolů, každý o výšce SPLIT_BAND_HEIGHT_PX, sousední se vždy
// překrývají (poslední výřez vždy končí přesně na `height`, ne dřív/dál).
// Exportováno zvlášť pro rychlý test bez dekódování obrázku.
export function computeBandTops(height: number): number[] {
  const step = SPLIT_BAND_HEIGHT_PX - SPLIT_OVERLAP_PX;
  const tops: number[] = [];
  let top = 0;
  while (top + SPLIT_BAND_HEIGHT_PX < height) {
    tops.push(top);
    top += step;
  }
  tops.push(Math.max(0, height - SPLIT_BAND_HEIGHT_PX));
  return tops;
}

async function splitIntoOverlappingBands(bytes: Buffer): Promise<Buffer[]> {
  try {
    const metadata = await sharp(bytes, { failOn: "none" }).metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height) {
      return [bytes];
    }
    if (height < SPLIT_MIN_HEIGHT_PX || height / width < SPLIT_MIN_ASPECT_RATIO) {
      return [bytes];
    }

    const tops = computeBandTops(height);
    const bands = await Promise.all(
      tops.map((top) => sharp(bytes, { failOn: "none" }).extract({ left: 0, top, width, height: SPLIT_BAND_HEIGHT_PX }).toBuffer())
    );
    return bands;
  } catch {
    return [bytes];
  }
}

// Hlavní vstupní bod volaný z skladExtraction.ts — jedna nahraná strana
// dokladu na vstupu, jeden nebo víc výřezů (v pořadí shora dolů) na
// výstupu, se stejným mediaType. Nikdy nevyhodí výjimku (viz komentář
// na začátku souboru).
export async function preprocessReceiptPage(image: ReceiptImageInput): Promise<ReceiptImageInput[]> {
  try {
    const cropped = await cropToReceipt(image.bytes);
    const enhanced = await normalizeAndSharpen(cropped);
    const bands = await splitIntoOverlappingBands(enhanced);
    return bands.map((bytes) => ({ mimeType: image.mimeType, bytes }));
  } catch {
    return [{ mimeType: image.mimeType, bytes: image.bytes }];
  }
}
