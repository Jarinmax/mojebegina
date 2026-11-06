// Práce 2.0 — kontrola a vyčištění fotografie (čistá funkce, bez I/O).
//
// Přijímá se JEN JPEG (klient fotku vždy zmenší a překóduje přes canvas, což
// metadata zahodí už v telefonu). Server to nebere jako samozřejmost:
//   • projde strukturu souboru po segmentech (žádné dekódování obrazu),
//   • odstraní APP1–APP15 (EXIF včetně GPS, XMP, ICC…) a komentáře (COM),
//     APP0 ponechá jen jako čisté JFIF,
//   • odmítne neobvyklé varianty JPEG (jen baseline/extended/progressive),
//   • zahodí cokoli za koncovou značkou EOI (skrytá data, „polyglot“ soubory),
//   • ověří rozměry a velikost.
// Výsledek se ukládá a vydává vždy jako image/jpeg s nosniff.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB (limit Vercel funkcí je 4,5 MB)
export const MAX_PHOTO_DIMENSION = 4096;

export type SanitizedJpeg = { bytes: Uint8Array; width: number; height: number };
export type SanitizeResult = { ok: true; value: SanitizedJpeg } | { ok: false; error: string };

const fail = (error: string): SanitizeResult => ({ ok: false, error });

const SUPPORTED_SOF = new Set([0xc0, 0xc1, 0xc2]);
const OTHER_SOF = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function sanitizeJpeg(input: Uint8Array): SanitizeResult {
  if (input.length === 0) return fail("Prázdný soubor.");
  if (input.length > MAX_PHOTO_BYTES) return fail("Fotografie je příliš velká (max. 4 MB).");
  if (input[0] !== 0xff || input[1] !== 0xd8) return fail("Soubor není fotografie ve formátu JPEG.");

  const out: Uint8Array[] = [input.subarray(0, 2)];
  let pos = 2;
  let width = 0;
  let height = 0;

  while (pos < input.length) {
    if (input[pos] !== 0xff) return fail("Poškozený soubor JPEG.");
    while (pos < input.length && input[pos] === 0xff) pos++; // výplňové 0xFF
    if (pos >= input.length) return fail("Poškozený soubor JPEG.");
    const marker = input[pos];
    pos++;

    if (marker === 0xd9) return fail("Poškozený soubor JPEG (chybí obrazová data).");
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(new Uint8Array([0xff, marker]));
      continue;
    }
    if (pos + 2 > input.length) return fail("Poškozený soubor JPEG.");
    const length = (input[pos] << 8) | input[pos + 1];
    if (length < 2 || pos + length > input.length) return fail("Poškozený soubor JPEG.");
    const segment = input.subarray(pos - 2, pos + length); // FF, marker, délka, data
    const payload = input.subarray(pos + 2, pos + length);

    if (OTHER_SOF.has(marker)) return fail("Nepodporovaný typ JPEG.");
    if (SUPPORTED_SOF.has(marker)) {
      if (payload.length < 6) return fail("Poškozený soubor JPEG.");
      height = (payload[1] << 8) | payload[2];
      width = (payload[3] << 8) | payload[4];
    }

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isJfif = marker === 0xe0 && payload.length >= 5 && String.fromCharCode(...payload.subarray(0, 5)) === "JFIF\0";
    const drop = (isApp && !isJfif) || marker === 0xfe;
    if (!drop) out.push(segment);
    pos += length;

    if (marker === 0xda) {
      // Začátek obrazových dat: zkopírovat vše až po POSLEDNÍ značku EOI, nic za ní.
      let eoi = -1;
      for (let i = input.length - 2; i >= pos; i--) {
        if (input[i] === 0xff && input[i + 1] === 0xd9) {
          eoi = i;
          break;
        }
      }
      if (eoi < 0) return fail("Poškozený soubor JPEG (chybí konec obrázku).");
      if (width === 0 || height === 0) return fail("Poškozený soubor JPEG (chybí rozměry).");
      if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
        return fail(`Fotografie má příliš velké rozměry (max. ${MAX_PHOTO_DIMENSION} px).`);
      }
      out.push(input.subarray(pos, eoi + 2));
      const total = out.reduce((n, c) => n + c.length, 0);
      const bytes = new Uint8Array(total);
      let off = 0;
      for (const c of out) {
        bytes.set(c, off);
        off += c.length;
      }
      return { ok: true, value: { bytes, width, height } };
    }
  }
  return fail("Poškozený soubor JPEG (chybí obrazová data).");
}
