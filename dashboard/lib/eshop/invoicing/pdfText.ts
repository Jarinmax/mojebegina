// Text z PDF faktury (iDoklad) pro kontrolu obsahu — bez další závislosti:
// pdf-lib (už v projektu) rozbalí stránky, písma a proudy, zlib je dekóduje.
// Umí to, co PDF z generátorů faktur používají: Tj/TJ/'/" v literálech i hex,
// jednobajtová písma (WinAnsi) a vložená písma Type0 (Identity-H) s ToUnicode.
// Nejde o přesné rozvržení — jen o spolehlivé hledání frází (kontrola, zda PDF
// nevyzývá k úhradě a neupozorňuje na prodlení). Neznámé konstrukce přeskočí.
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, type PDFObject } from "pdf-lib";

type CMap = { bytes: 1 | 2; map: Map<number, string> };

function streamBytes(obj: PDFObject | undefined, doc: PDFDocument): Uint8Array | null {
  const resolved = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (!(resolved instanceof PDFRawStream)) return null;
  const filter = resolved.dict.lookup(PDFName.of("Filter"));
  const names = filter instanceof PDFArray ? filter.asArray().map((f) => String(f)) : filter ? [String(filter)] : [];
  let data: Uint8Array = resolved.contents;
  for (const name of names) {
    if (name === "/FlateDecode") data = inflateSync(data);
    else return null; // jiné filtry (obrázky apod.) nepotřebujeme
  }
  return data;
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

/** ToUnicode CMap → kód znaku → text. */
export function parseToUnicode(source: string): CMap {
  const map = new Map<number, string>();
  let bytes: 1 | 2 = 1;
  const range = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(source);
  if (range && /<[0-9a-fA-F]{4}>/.test(range[1])) bytes = 2;
  const hexText = (hex: string) => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      if (m[1].length >= 4) bytes = 2;
      map.set(parseInt(m[1], 16), hexText(m[2]));
    }
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/g)) {
      if (m[1].length >= 4) bytes = 2;
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[3].startsWith("[")) {
        const items = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexText(x[1]));
        items.forEach((text, i) => map.set(lo + i, text));
      } else {
        const start = m[3].slice(1, -1);
        const base = parseInt(start.slice(-4) || "0", 16);
        const prefix = hexText(start.slice(0, -4));
        for (let code = lo; code <= hi; code += 1) map.set(code, prefix + String.fromCharCode(base + (code - lo)));
      }
    }
  }
  return { bytes, map };
}

/** Řetězec PDF (literál bez závorek) → bajty. */
function literalBytes(raw: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c !== "\\") {
      out.push(raw.charCodeAt(i) & 0xff);
      continue;
    }
    const n = raw[i + 1];
    i += 1;
    if (n === undefined) break;
    if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(raw[i + 1] ?? "")) oct += raw[++i];
      out.push(parseInt(oct, 8) & 0xff);
    } else if (n === "\n") continue;
    else if (n === "\r") {
      if (raw[i + 1] === "\n") i += 1;
    } else out.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[n] ?? n.charCodeAt(0));
  }
  return out;
}

function decode(bytes: number[], cmap: CMap | null): string {
  if (!cmap) return Buffer.from(bytes).toString("latin1");
  let out = "";
  for (let i = 0; i < bytes.length; i += cmap.bytes) {
    const code = cmap.bytes === 2 ? (bytes[i] << 8) | (bytes[i + 1] ?? 0) : bytes[i];
    out += cmap.map.get(code) ?? (cmap.bytes === 1 ? String.fromCharCode(code) : "");
  }
  return out;
}

/** Tokeny obsahu stránky: řetězce, pole TJ, jména, čísla a operátory. */
function* tokens(src: string): Generator<{ t: "str"; b: number[] } | { t: "arr"; items: ({ b: number[] } | number)[] } | { t: "name"; v: string } | { t: "num"; v: number } | { t: "op"; v: string }> {
  let i = 0;
  const readString = (): number[] => {
    // src[i] === "("
    let depth = 0;
    let raw = "";
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === "\\") {
        raw += c + (src[i + 1] ?? "");
        i += 1;
        continue;
      }
      if (c === "(") {
        depth += 1;
        if (depth === 1) continue;
      } else if (c === ")") {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
      raw += c;
    }
    return literalBytes(raw);
  };
  const readHex = (): number[] => {
    const end = src.indexOf(">", i);
    const hex = src.slice(i + 1, end < 0 ? src.length : end).replace(/\s+/g, "");
    i = end < 0 ? src.length : end + 1;
    const out: number[] = [];
    for (let k = 0; k < hex.length; k += 2) out.push(parseInt((hex[k] ?? "0") + (hex[k + 1] ?? "0"), 16));
    return out;
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === "%") {
      while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i += 1;
    } else if (c === "(") {
      yield { t: "str", b: readString() };
    } else if (c === "<" && src[i + 1] === "<") {
      i += 2; // slovník (inline obrázek apod.) — přeskočit jako operátor
    } else if (c === ">" && src[i + 1] === ">") {
      i += 2;
    } else if (c === "<") {
      yield { t: "str", b: readHex() };
    } else if (c === "[") {
      i += 1;
      const items: ({ b: number[] } | number)[] = [];
      while (i < src.length && src[i] !== "]") {
        const d = src[i];
        if (/\s/.test(d)) i += 1;
        else if (d === "(") items.push({ b: readString() });
        else if (d === "<") items.push({ b: readHex() });
        else {
          const m = /^[-+]?(\d+\.?\d*|\.\d+)/.exec(src.slice(i, i + 32));
          if (m) {
            items.push(Number(m[0]));
            i += m[0].length;
          } else i += 1;
        }
      }
      i += 1;
      yield { t: "arr", items };
    } else if (c === "/") {
      const m = /^\/[^\s/<>[\]()%{}]*/.exec(src.slice(i, i + 128))!;
      i += m[0].length;
      yield { t: "name", v: m[0].slice(1) };
    } else {
      const num = /^[-+]?(\d+\.?\d*|\.\d+)/.exec(src.slice(i, i + 32));
      if (num) {
        i += num[0].length;
        yield { t: "num", v: Number(num[0]) };
        continue;
      }
      const op = /^[^\s/<>[\]()%{}]+/.exec(src.slice(i, i + 32));
      if (op) {
        i += op[0].length;
        yield { t: "op", v: op[0] };
      } else i += 1;
    }
  }
}

function fontMaps(doc: PDFDocument, resources: PDFDict | undefined): Map<string, CMap | null> {
  const out = new Map<string, CMap | null>();
  const fonts = resources?.lookup(PDFName.of("Font"));
  if (!(fonts instanceof PDFDict)) return out;
  for (const [name, ref] of fonts.entries()) {
    const font = doc.context.lookup(ref);
    if (!(font instanceof PDFDict)) continue;
    const bytes = streamBytes(font.get(PDFName.of("ToUnicode")), doc);
    out.set(name.asString().slice(1), bytes ? parseToUnicode(latin1(bytes)) : null);
  }
  return out;
}

function pageText(content: string, fonts: Map<string, CMap | null>): string {
  let out = "";
  let cmap: CMap | null = null;
  let pendingName: string | null = null;
  for (const tok of tokens(content)) {
    if (tok.t === "name") pendingName = tok.v;
    else if (tok.t === "op") {
      if (tok.v === "Tf" && pendingName !== null) cmap = fonts.get(pendingName) ?? null;
      else if (tok.v === "ET" || tok.v === "T*" || tok.v === "Td" || tok.v === "TD" || tok.v === "'" || tok.v === '"') out += "\n";
      else if (tok.v === "Tm") out += "\n";
      pendingName = tok.v === "Tf" ? null : pendingName;
    } else if (tok.t === "str") out += decode(tok.b, cmap);
    else if (tok.t === "arr") {
      for (const item of tok.items) {
        if (typeof item === "number") {
          if (item < -200) out += " ";
        } else out += decode(item.b, cmap);
      }
    }
  }
  return out;
}

/** Celý text PDF (všechny stránky), řádky oddělené \n. Chyba čtení → vyhodí. */
export async function extractPdfText(pdf: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false, ignoreEncryption: true });
  const parts: string[] = [];
  for (const page of doc.getPages()) {
    const fonts = fontMaps(doc, page.node.Resources());
    const contents = page.node.get(PDFName.of("Contents"));
    const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
    const streams = resolved instanceof PDFArray ? resolved.asArray() : [contents];
    const source = streams.map((s) => streamBytes(s, doc)).filter((b): b is Uint8Array => b !== null).map(latin1).join("\n");
    parts.push(pageText(source, fonts));
  }
  return parts
    .join("\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type PdfPaymentCheck = {
  /** true = PDF nevyzývá k úhradě a neupozorňuje na prodlení */
  ok: boolean;
  /** řádky s výzvou k úhradě (nenulová částka k úhradě, QR platba, „uhraďte“…) */
  paymentRequest: string[];
  /** řádky s upozorněním na prodlení / po splatnosti / upomínkou */
  overdueNotice: string[];
  /** řádky s údajem „k úhradě / zbývá uhradit“ (pro kontrolu člověkem) */
  amountLines: string[];
};

const OVERDUE = /(po splatnosti|prodleni|prodlen|upomink|urok z prodleni|smluvni pokut)/;
const REQUEST = /(qr\s*platb|uhradte|prosime o uhradu|zaplatte|zaplatit do)/;
const AMOUNT_DUE = /(k uhrade|zbyva uhradit|zbyva zaplatit|celkem k uhrade|k zaplaceni)/;

/** Kontrola textu PDF: výzva k úhradě a upozornění na prodlení. */
export function checkInvoicePdfText(text: string): PdfPaymentCheck {
  const lines = text.split("\n");
  const paymentRequest: string[] = [];
  const overdueNotice: string[] = [];
  const amountLines: string[] = [];
  lines.forEach((line, i) => {
    const f = fold(line);
    if (OVERDUE.test(f)) overdueNotice.push(line);
    if (REQUEST.test(f)) paymentRequest.push(line);
    if (AMOUNT_DUE.test(f)) {
      // částka bývá na stejném nebo na následujícím řádku
      const withNext = `${line} ${lines[i + 1] ?? ""}`;
      amountLines.push(withNext.trim());
      // jen skutečné částky: s desetinnou čárkou nebo s měnou (ne data a čísla dokladů)
      const amounts = [...withNext.matchAll(/(-?\d{1,3}(?:[  .]\d{3})*(?:,\d{2})?|-?\d+(?:,\d{2})?)(\s*(?:kč|czk))?/gi)]
        .filter((m) => m[2] !== undefined || /,\d{2}$/.test(m[1]))
        .map((m) => Number(m[1].replace(/[  .]/g, "").replace(",", ".")))
        .filter((n) => Number.isFinite(n));
      if (amounts.some((n) => Math.abs(n) >= 0.005)) paymentRequest.push(withNext.trim());
    }
  });
  return { ok: paymentRequest.length === 0 && overdueNotice.length === 0, paymentRequest, overdueNotice, amountLines };
}
