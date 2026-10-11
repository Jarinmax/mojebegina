// Mobilní tok 1.0 — čistě prohlížečový kód (Canvas, crypto.subtle, File),
// NIKDY neimportovat ze server-side souboru. Zodpovídá za body 3+4 zadání:
// převod HEIC/velkých fotek na JPEG (max. 2200 px delší strana, kvalita
// ~85 %) a výpočet SHA-256 z KONEČNÝCH (už převedených) dat — ne
// z originálu, aby otisk odpovídal tomu, co se skutečně nahraje.
//
// HEIC dekódování: většina prohlížečů (Chrome, Firefox) neumí HEIC
// nativně dekódovat vůbec (jen Safari má OS dekodér) — proto se nejdřív
// zkusí nativní `createImageBitmap` (pokryje JPEG/PNG/WebP i HEIC na
// Safari) a teprve při selhání se dotáhne `heic2any` (lazy import, ať
// uživatelé bez HEIC souboru neplatí jeho velikost v balíčku).
import { computeResizeTarget, UPLOAD_JPEG_QUALITY } from "./imageResize";

export type PreparedUpload = { blob: Blob; sha256: string };

export async function prepareImageForUpload(file: File): Promise<PreparedUpload> {
  const bitmap = await decodeImage(file);
  try {
    const target = computeResizeTarget(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D kontext není v tomhle prohlížeči dostupný.");
    }
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Převod fotky na JPEG selhal."))),
        "image/jpeg",
        UPLOAD_JPEG_QUALITY
      );
    });

    return { blob: jpegBlob, sha256: await sha256Hex(jpegBlob) };
  } finally {
    bitmap.close();
  }
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Nativní dekódování selhalo — nejčastěji HEIC/HEIF mimo Safari.
    const { default: heic2any } = await import("heic2any");
    let converted: Blob;
    try {
      const result = await heic2any({ blob: file, toType: "image/jpeg", quality: UPLOAD_JPEG_QUALITY });
      converted = Array.isArray(result) ? result[0] : result;
    } catch {
      throw new Error("Fotku se nepodařilo zpracovat — nepodporovaný nebo poškozený formát souboru.");
    }
    return createImageBitmap(converted);
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
