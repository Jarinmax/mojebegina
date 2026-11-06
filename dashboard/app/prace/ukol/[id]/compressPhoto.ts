// Práce 2.0 — zmenšení a překódování fotky v telefonu před odesláním.
// Kreslením do canvasu vznikne nový JPEG BEZ metadat (EXIF/GPS se nepřenesou)
// a se správnou orientací; zároveň se zmenší objem dat (max. 1600 px).
// Server fotku i tak kontroluje a čistí znovu (lib/prace/jpeg.ts).
const MAX_SIDE = 1600;
const QUALITY = 0.82;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // některé prohlížeče neumí volby — zkusit <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function compressPhoto(file: File): Promise<Blob> {
  const { source, width, height, close } = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", QUALITY)
    );
  } finally {
    close();
  }
}
