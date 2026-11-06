import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, sanitizeJpeg } from "../jpeg";

// Syntetický JPEG po segmentech (dekódování obrazu sanitizace nepotřebuje).
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const sof = (w: number, h: number, marker = 0xc0) => seg(marker, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]);
const sos = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
const scan = [0x12, 0x34, 0xff, 0x00, 0x56]; // entropická data (FF00 = escapovaný bajt)
const exifGps = seg(0xe1, [...ascii("Exif\0\0"), ...ascii("GPS 50.0755N 14.4378E")]);
const xmp = seg(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/\0"), ...ascii("<gps/>")]);
const comment = seg(0xfe, ascii("tajny komentar"));
const jfif = seg(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const dqt = seg(0xdb, [0, ...Array(64).fill(1)]);
const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat());
const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("sanitizeJpeg", () => {
  it("odstraní EXIF/GPS, XMP i komentář, ponechá JFIF, tabulky a obrazová data; vrátí rozměry", () => {
    const r = sanitizeJpeg(jpeg(SOI, jfif, exifGps, xmp, comment, dqt, sof(1600, 1200), sos, scan, EOI));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ width: 1600, height: 1200 });
    const out = text(r.value.bytes);
    expect(out).not.toContain("GPS");
    expect(out).not.toContain("Exif");
    expect(out).not.toContain("adobe");
    expect(out).not.toContain("tajny");
    expect(out).toContain("JFIF");
    expect(Array.from(r.value.bytes)).toEqual([...SOI, ...jfif, ...dqt, ...sof(1600, 1200), ...sos, ...scan, ...EOI]);
  });

  it("zahodí data za koncem obrázku (skrytý obsah)", () => {
    const r = sanitizeJpeg(jpeg(SOI, sof(10, 10), sos, scan, EOI, ascii("<script>alert(1)</script>")));
    expect(r.ok && text(r.value.bytes).includes("script")).toBe(false);
  });

  it("progresivní JPEG projde", () => {
    expect(sanitizeJpeg(jpeg(SOI, sof(10, 10, 0xc2), sos, scan, EOI)).ok).toBe(true);
  });

  it.each([
    ["PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["HTML", new Uint8Array(ascii("<html><script>x</script></html>"))],
    ["prázdný", new Uint8Array()],
    ["bez obrazových dat", jpeg(SOI, sof(10, 10), EOI)],
    ["bez EOI", jpeg(SOI, sof(10, 10), sos, scan)],
    ["bez rozměrů", jpeg(SOI, sos, scan, EOI)],
    ["useknutý segment", jpeg(SOI, [0xff, 0xe1, 0x40, 0x00, 1, 2])],
    ["bezeztrátový JPEG", jpeg(SOI, sof(10, 10, 0xc3), sos, scan, EOI)],
    ["příliš velké rozměry", jpeg(SOI, sof(5000, 100), sos, scan, EOI)],
  ])("odmítne: %s", (_n, bytes) => {
    expect(sanitizeJpeg(bytes).ok).toBe(false);
  });

  it("odmítne soubor nad 4 MB", () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set([0xff, 0xd8]);
    expect(sanitizeJpeg(big)).toEqual({ ok: false, error: "Fotografie je příliš velká (max. 4 MB)." });
  });
});
