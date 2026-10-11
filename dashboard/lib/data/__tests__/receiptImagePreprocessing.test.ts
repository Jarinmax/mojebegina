// Mobilní tok 1.0 — oprava po prvním ostrém testu: ořez/normalizace/
// rozdělení fotky účtenky, PŘED OCR. Testuje se se skutečnými
// syntetickými obrázky (sharp), beze mockování — stejný princip jako
// skladValidation.test.ts (čistá logika, testovatelná beze mocků). Co
// tenhle test NEMŮŽE dokázat: jestli konkrétní ořez/rozdělení skutečně
// zlepší přesnost živého OCR na reálné fotce — to ukáže až ostrý test
// po nasazení (žádné živé volání modelu tady ani jinde v test suitě).
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  computeBandTops,
  preprocessReceiptPage,
  SPLIT_BAND_HEIGHT_PX,
  SPLIT_MIN_HEIGHT_PX,
  SPLIT_OVERLAP_PX,
} from "../receiptImagePreprocessing";

async function makeDarkBackgroundWithLightReceipt(): Promise<Buffer> {
  const fullWidth = 400;
  const fullHeight = 300;
  const rectLeft = 60;
  const rectTop = 40;
  const rectWidth = 280; // ~65 % šířky
  const rectHeight = 220; // ~73 % výšky → ořez pokrývá ~51 % plochy, bezpečně nad MIN_CROP_AREA_FRACTION (10 %) i pod MAX (98 %)

  const lightRect = await sharp({
    create: { width: rectWidth, height: rectHeight, channels: 3, background: { r: 235, g: 235, b: 235 } },
  })
    .png()
    .toBuffer();

  return sharp({ create: { width: fullWidth, height: fullHeight, channels: 3, background: { r: 15, g: 15, b: 15 } } })
    .composite([{ input: lightRect, left: rectLeft, top: rectTop }])
    .jpeg()
    .toBuffer();
}

describe("preprocessReceiptPage — ořez světlé účtenky z tmavého pozadí", () => {
  it("ořízne na oblast světlého obdélníku (+ rezerva) — výsledek je menší než originál, jen jeden výřez (krátký doklad); diagnostika hlásí původní rozměry i nalezený ořez", async () => {
    const original = await makeDarkBackgroundWithLightReceipt();
    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes: original });

    expect(result.images).toHaveLength(1);
    const originalMeta = await sharp(original).metadata();
    const resultMeta = await sharp(result.images[0].bytes).metadata();
    expect(resultMeta.width!).toBeLessThan(originalMeta.width!);
    expect(resultMeta.height!).toBeLessThan(originalMeta.height!);
    // Ořez by měl zhruba odpovídat rozměru světlého obdélníku (280×220) + malá rezerva, ne téměř celému snímku.
    expect(resultMeta.width!).toBeLessThan(340);
    expect(resultMeta.height!).toBeLessThan(260);
    expect(result.images[0].mimeType).toBe("image/jpeg");

    // Bezpečná diagnostika: původní rozměry, nalezený ořez, rozměry výřezu.
    expect(result.diagnostics.originalWidth).toBe(400);
    expect(result.diagnostics.originalHeight).toBe(300);
    expect(result.diagnostics.crop).not.toBeNull();
    expect(result.diagnostics.crop!.width).toBeLessThan(340);
    expect(result.diagnostics.crop!.height).toBeLessThan(260);
    expect(result.diagnostics.bandDimensions).toHaveLength(1);
    expect(result.diagnostics.bandDimensions[0]).toEqual({ width: resultMeta.width, height: resultMeta.height });
  });

  it("jednolitě šedý obrázek (žádná rozpoznatelná hranice pozadí/účtenky) se neořízne — appka ho pošle beze změny rozměru, diagnostika hlásí crop:null", async () => {
    const uniform = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 128, g: 128, b: 128 } } })
      .jpeg()
      .toBuffer();
    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes: uniform });
    const resultMeta = await sharp(result.images[0].bytes).metadata();
    expect(resultMeta.width).toBe(300);
    expect(resultMeta.height).toBe(300);
    expect(result.diagnostics.crop).toBeNull();
    expect(result.diagnostics.originalWidth).toBe(300);
    expect(result.diagnostics.originalHeight).toBe(300);
  });

  it("nedekódovatelný vstup (poškozená/neplatná data) appka bezpečně pošle beze změny, nikdy nevyhodí výjimku — diagnostika zůstane bezpečně prázdná", async () => {
    const garbage = Buffer.from([1, 2, 3, 4, 5]);
    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes: garbage });
    expect(result.images).toHaveLength(1);
    expect(result.images[0].bytes.equals(garbage)).toBe(true);
    expect(result.images[0].mimeType).toBe("image/jpeg");
    expect(result.diagnostics.originalWidth).toBeNull();
    expect(result.diagnostics.originalHeight).toBeNull();
    expect(result.diagnostics.crop).toBeNull();
  });
});

describe("preprocessReceiptPage — rozdělení dlouhé účtenky na překrývající se výřezy shora dolů", () => {
  it("krátký doklad (pod prahovou výškou) se nedělí — jeden výřez", async () => {
    const short = await sharp({ create: { width: 800, height: 1200, channels: 3, background: { r: 230, g: 230, b: 230 } } })
      .jpeg()
      .toBuffer();
    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes: short });
    expect(result.images).toHaveLength(1);
    expect(result.diagnostics.bandDimensions).toHaveLength(1);
  });

  it("vysoký, ale dost ŠIROKÝ obrázek (pod prahovým poměrem stran) se nedělí, i když je nad prahovou výškou", async () => {
    // výška nad SPLIT_MIN_HEIGHT_PX, ale poměr výška/šířka pod SPLIT_MIN_ASPECT_RATIO (2.2)
    const wideTall = await sharp({ create: { width: 2000, height: 3000, channels: 3, background: { r: 230, g: 230, b: 230 } } })
      .jpeg()
      .toBuffer();
    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes: wideTall });
    expect(result.images).toHaveLength(1);
  });

  it("dlouhá úzká účtenka (výška >> šířka, nad oběma prahy) se rozdělí na víc výřezů s překryvem, v pořadí shora dolů; diagnostika hlásí rozměry KAŽDÉHO výřezu", async () => {
    const height = 6000;
    const width = 800;
    const tall = await sharp({ create: { width, height, channels: 3, background: { r: 230, g: 230, b: 230 } } })
      .jpeg()
      .toBuffer();
    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes: tall });

    expect(result.images.length).toBeGreaterThan(1);
    const metas = await Promise.all(result.images.map((r) => sharp(r.bytes).metadata()));
    expect(metas.every((m) => m.width === width)).toBe(true);
    expect(metas.every((m) => m.height === SPLIT_BAND_HEIGHT_PX)).toBe(true);

    const expectedTops = computeBandTops(height);
    expect(result.images).toHaveLength(expectedTops.length);
    // poslední výřez musí dosáhnout přesně na spodní okraj originálu
    expect(expectedTops[expectedTops.length - 1] + SPLIT_BAND_HEIGHT_PX).toBe(height);

    // Diagnostika hlásí stejný počet a stejné rozměry výřezů jako skutečný výstup.
    expect(result.diagnostics.bandDimensions).toHaveLength(result.images.length);
    expect(result.diagnostics.bandDimensions.every((d) => d.width === width && d.height === SPLIT_BAND_HEIGHT_PX)).toBe(true);
    expect(result.diagnostics.originalWidth).toBe(width);
    expect(result.diagnostics.originalHeight).toBe(height);
  });
});

describe("computeBandTops — čistá aritmetika dělení (bez dekódování obrázku)", () => {
  it("pokrývá celou výšku bez mezer: každý další výřez začíná dřív, než předchozí končí, ale přísně dál než jeho vlastní start", () => {
    const height = 6000;
    const tops = computeBandTops(height);
    expect(tops[0]).toBe(0);
    expect(tops[tops.length - 1]).toBe(height - SPLIT_BAND_HEIGHT_PX);
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1]); // postupuje přísně dopředu (shora dolů)
      expect(tops[i]).toBeLessThan(tops[i - 1] + SPLIT_BAND_HEIGHT_PX); // překryv se sousedním výřezem, žádná mezera
    }
  });

  it("sousední výřezy se překrývají aspoň o SPLIT_OVERLAP_PX (kromě případného doladění posledního výřezu)", () => {
    const tops = computeBandTops(10000);
    for (let i = 1; i < tops.length - 1; i += 1) {
      const overlap = tops[i - 1] + SPLIT_BAND_HEIGHT_PX - tops[i];
      expect(overlap).toBeGreaterThanOrEqual(SPLIT_OVERLAP_PX);
    }
  });

  it("výška těsně nad prahem dá dva výřezy, co se překrývají a dohromady pokryjí celou výšku", () => {
    const height = SPLIT_MIN_HEIGHT_PX + 1;
    const tops = computeBandTops(height);
    expect(tops.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...tops) + SPLIT_BAND_HEIGHT_PX).toBe(height);
  });
});
