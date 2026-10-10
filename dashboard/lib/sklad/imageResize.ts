// Mobilní tok 1.0 — čistá matematika za zmenšením fotky, bez Canvasu/File
// API (ty žijí v clientUpload.ts, který se nedá spustit mimo prohlížeč).
// Oddělené sem, aby šlo otestovat bez DOM.
export const MAX_UPLOAD_DIMENSION_PX = 2200;
export const UPLOAD_JPEG_QUALITY = 0.85;

export type ResizeTarget = { width: number; height: number };

// Nikdy nezvětšuje (delší strana pod limitem zůstává beze změny) — jen
// zmenšuje tak, aby delší strana byla přesně MAX_UPLOAD_DIMENSION_PX,
// druhá strana se dopočítá proporčně a zaokrouhlí na celé pixely (musí
// být aspoň 1).
export function computeResizeTarget(
  width: number,
  height: number,
  maxDimension: number = MAX_UPLOAD_DIMENSION_PX
): ResizeTarget {
  const longerSide = Math.max(width, height);
  if (longerSide <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longerSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
