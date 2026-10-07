// ESHOP 1.0 — logika kolotoče (čistá, testovaná zvlášť).

/**
 * Pozice podle skutečného posunu: poslední pozice = konec řady (i když
 * posun na konci není celý násobek kroku — např. na mobilu, kde je vidět
 * 1,6 dlaždice).
 */
export function positionFromScroll(scrollLeft: number, maxScroll: number, step: number): { index: number; last: number } {
  if (step <= 0 || maxScroll <= 0) return { index: 0, last: 0 };
  const last = Math.ceil((maxScroll - 1) / step);
  const index = scrollLeft >= maxScroll - 2 ? last : Math.min(last, Math.round(scrollLeft / step));
  return { index, last };
}

/** Kolik dlaždic je vidět naráz podle šířky kontejneru a dlaždice. */
export function visibleCount(containerWidth: number, itemWidth: number, gap: number): number {
  if (itemWidth <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + gap + 1) / (itemWidth + gap)));
}

/** Poslední pozice, od které je vidět konec řady. */
export function lastIndex(total: number, visible: number): number {
  return Math.max(0, total - visible);
}

/** Další pozice; po konci zpět na začátek („dokola“). */
export function nextIndex(current: number, last: number): number {
  return current >= last ? 0 : current + 1;
}

/** Předchozí pozice; ze začátku na konec. */
export function prevIndex(current: number, last: number): number {
  return current <= 0 ? last : current - 1;
}

/** Interval automatického posunu (ms). */
export const AUTOPLAY_MS = 4000;
