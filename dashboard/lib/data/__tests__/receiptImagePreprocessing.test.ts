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
  SPLIT_MIN_ASPECT_RATIO,
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

// Reálný nález na příjemce c0b9c518-fd05-413e-8162-5853fb471257: dlouhá
// úzká účtenka vyfocená uprostřed širší fotografie (vidět stůl/pozadí po
// stranách), s drobnými jasnými odlesky (lesk na stole, odraz světla)
// blízko okrajů snímku. Starý ořez (obalující obdélník VŠECH jasných
// pixelů) se nechal jediným jasným pixelem u kraje natáhnout přes skoro
// celou fotografii → prahy dělení pak posuzovaly CELOU FOTKU s pozadím
// (poměr stran pod prahem), ne samotnou účtenku, takže se vůbec
// nerozdělila na výřezy a OCR dostal nezvětšený snímek s málo čitelným
// drobným tiskem.
async function makeNarrowReceiptWithEdgeGlare(): Promise<{
  bytes: Buffer;
  fullWidth: number;
  fullHeight: number;
  stripLeft: number;
  stripTop: number;
  stripWidth: number;
  stripHeight: number;
}> {
  const fullWidth = 1800;
  const fullHeight = 3000;
  const stripWidth = 350;
  const stripHeight = 2700;
  const stripLeft = Math.round((fullWidth - stripWidth) / 2);
  const stripTop = 150;

  const strip = await sharp({
    create: { width: stripWidth, height: stripHeight, channels: 3, background: { r: 235, g: 235, b: 235 } },
  })
    .png()
    .toBuffer();

  const glareSize = 24;
  const glare = await sharp({
    create: { width: glareSize, height: glareSize, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  // Čtyři izolované odlesky blízko všech čtyř okrajů fotky — každý mimo
  // šířku účtenky (stripLeft..stripLeft+stripWidth), dva navíc blízko
  // horního/dolního rohu, ať je vidět, že appka ořez nenatáhne ani
  // nahoru/dolů kvůli nim.
  const bytes = await sharp({
    create: { width: fullWidth, height: fullHeight, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .composite([
      { input: strip, left: stripLeft, top: stripTop },
      { input: glare, left: 15, top: 700 }, // levý okraj
      { input: glare, left: fullWidth - glareSize - 15, top: 1800 }, // pravý okraj
      { input: glare, left: 25, top: 40 }, // levý horní roh
      { input: glare, left: fullWidth - glareSize - 50, top: fullHeight - glareSize - 30 }, // pravý dolní roh
    ])
    .jpeg()
    .toBuffer();

  return { bytes, fullWidth, fullHeight, stripLeft, stripTop, stripWidth, stripHeight };
}

describe("preprocessReceiptPage — robustnost ořezu: dlouhá úzká účtenka uprostřed širší fotky, jasné odlesky u okrajů (reálný nález, příjemka c0b9c518-...)", () => {
  it("ořez zůstane u skutečné účtenky — izolované odlesky u všech čtyř okrajů fotky ho nenatáhnou přes (skoro) celý snímek, zachová horní i dolní konec dokladu, a díky tomu pak následné dělení na výřezy správně nastoupí", async () => {
    const { bytes, fullWidth, fullHeight, stripLeft, stripTop, stripWidth, stripHeight } = await makeNarrowReceiptWithEdgeGlare();
    const stripRight = stripLeft + stripWidth;
    const stripBottom = stripTop + stripHeight;

    // Kontrola zadání testu: BEZ ořezu (celá fotka s pozadím po stranách)
    // by appka dělení vůbec nespustila — poměr stran celé fotky je pod
    // prahem, i když účtenka samotná je nad ním. Dělení tedy v tomhle
    // testu skutečně závisí na tom, že se appka ořízne na samotnou
    // účtenku, ne na rozměry celé fotky.
    expect(fullHeight / fullWidth).toBeLessThan(SPLIT_MIN_ASPECT_RATIO);
    expect(stripHeight / stripWidth).toBeGreaterThanOrEqual(SPLIT_MIN_ASPECT_RATIO);
    expect(stripHeight).toBeGreaterThanOrEqual(SPLIT_MIN_HEIGHT_PX);

    const result = await preprocessReceiptPage({ mimeType: "image/jpeg", bytes });
    const crop = result.diagnostics.crop;
    expect(crop).not.toBeNull();

    // Ořez zůstal úzký — odlesky u levého/pravého okraje ho nenatáhly
    // přes (skoro) celou šířku fotky (to by starý ořez — obalující
    // obdélník všech jasných pixelů — udělal).
    expect(crop!.width).toBeLessThan(fullWidth * 0.5);
    expect(crop!.left).toBeGreaterThan(300);
    expect(crop!.left + crop!.width).toBeLessThan(fullWidth - 300);

    // Ořez skutečně POKRÝVÁ celou šířku reálné účtenky, ne jen její část.
    expect(crop!.left).toBeLessThanOrEqual(stripLeft);
    expect(crop!.left + crop!.width).toBeGreaterThanOrEqual(stripRight);

    // Zachování horního i dolního konce dokladu — odlesky v rozích
    // ořez neuřízly tak, aby chyběl začátek nebo konec účtenky.
    expect(crop!.top).toBeLessThanOrEqual(stripTop);
    expect(crop!.top + crop!.height).toBeGreaterThanOrEqual(stripBottom);

    // Následné dělení: díky správnému ořezu teď poměr stran i výška
    // PŘEKROČÍ prahy a appka doklad rozdělí na víc výřezů — na rozdíl od
    // ořezu přes celou fotku, kde by k tomu (viz kontrola zadání výš)
    // nikdy nedošlo.
    expect(result.images.length).toBeGreaterThan(1);
    expect(result.diagnostics.bandDimensions).toHaveLength(result.images.length);

    // Dělení pokrývá ořez od úplně horního po úplně dolní konec, beze
    // zbytku (stejná záruka jako computeBandTops jinde v souboru), tentokrát
    // nad SKUTEČNĚ ořezlou výškou dokladu, ne nad celým snímkem.
    const expectedTops = computeBandTops(crop!.height);
    expect(result.images).toHaveLength(expectedTops.length);
    expect(expectedTops[0]).toBe(0);
    expect(expectedTops[expectedTops.length - 1] + SPLIT_BAND_HEIGHT_PX).toBe(crop!.height);
    expect(result.diagnostics.bandDimensions.every((d) => d.height === SPLIT_BAND_HEIGHT_PX)).toBe(true);
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
