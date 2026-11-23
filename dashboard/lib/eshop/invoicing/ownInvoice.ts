// Vlastní fakturace MojeBegina (Lucie 23. 11. 2026): faktury už nevystavuje
// iDoklad, ale MojeBegina sama — JEDNA číselná řada RRRRNNNN (navazuje na
// Luciinu řadu 2026xxxx: první vlastní 20260215, od ledna 20270001).
//
// Tady jsou jen čisté funkce (bez DB): číslo faktury, snímek faktury
// (OwnInvoiceSnapshot — to, co je na faktuře, uložené natrvalo a neměnné)
// a vykreslení PDF. Vystavení (přidělení čísla + uložení) je v ownIssue.ts.
//
// Náležitosti (neplátce DPH, daňová evidence, § 435 občanského zákoníku):
// jméno, sídlo a IČO dodavatele, „Fyzická osoba zapsaná v živnostenském
// rejstříku“, odběratel, číslo dokladu, datum vystavení, položky, částka;
// navíc „Nejsem plátce DPH“, splatnost, VS a způsob úhrady.

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { BEGINA_PDF_SANS_BOLD, BEGINA_PDF_SANS_REGULAR } from "@/lib/eshop/legal/fonts/beginaPdfSans";
import { OPERATOR } from "@/lib/eshop/operator";
import { bankConfig, formatIban, spaydString } from "@/lib/eshop/bankTransfer";
import { LOGO_BEGINA_PNG_BASE64 } from "./logoBeginaPng";
import type { InvoiceDraft } from "./draft";

type Env = Record<string, string | undefined>;

/** Řada začíná rokem; pořadí ve roce 4 číslice (20260215). */
export function ownInvoiceNumber(year: number, serial: number): string {
  if (!Number.isInteger(year) || year < 2026 || year > 2099) throw new Error("Neplatný rok řady.");
  if (!Number.isInteger(serial) || serial < 1 || serial > 9999) throw new Error("Pořadí faktury mimo rozsah 1–9999.");
  return `${year}${String(serial).padStart(4, "0")}`;
}

export const OWN_INVOICE_NUMBER_RE = /^20\d{2}\d{4}$/;

export type OwnPaymentMethod = "card" | "bank_transfer" | "cash";

export const PAYMENT_METHOD_LABEL: Record<OwnPaymentMethod, string> = {
  card: "Platební kartou",
  bank_transfer: "Bankovním převodem",
  cash: "Hotově",
};

export type OwnInvoiceSupplier = {
  name: string;
  address: string;
  ico: string;
  registration: string;
  vatNote: string;
  bankAccount: string | null;
  iban: string | null;
  email: string;
  phone: string;
  web: string;
};

export type OwnInvoiceCustomer = {
  kind: "person" | "company";
  name: string;
  contactPerson: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  ico: string | null;
  dic: string | null;
  email: string | null;
};

export type OwnInvoiceLine = { name: string; quantity: number; unitPriceKc: number; totalKc: number };

/** Obsah faktury — ukládá se natrvalo, PDF se z něj dá kdykoli vykreslit znovu. */
export type OwnInvoiceSnapshot = {
  version: 1;
  kind: "invoice" | "credit_note";
  /** dobropis: číslo opravované faktury */
  correctsNumber: string | null;
  /** YYYY-MM-DD (Praha) */
  issueDate: string;
  dueDate: string;
  /** den úhrady; null = neuhrazeno */
  paidDate: string | null;
  paymentMethod: OwnPaymentMethod | null;
  vs: string | null;
  orderReference: string | null;
  supplier: OwnInvoiceSupplier;
  customer: OwnInvoiceCustomer;
  /** dodací adresa / osobní odběr (jen informačně) */
  delivery: string | null;
  lines: OwnInvoiceLine[];
  totalKc: number;
  note: string | null;
};

/** České číslo účtu „19-2000145399/0800“ → IBAN (když ESHOP_BANK_IBAN chybí — QR kód ho potřebuje). */
export function czIbanFromAccount(account: string | null): string | null {
  const m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec((account ?? "").replace(/\s/g, ""));
  if (!m) return null;
  const bban = `${m[3]}${(m[1] ?? "").padStart(6, "0")}${m[2].padStart(10, "0")}`;
  const check = 98n - (BigInt(`${bban}123500`) % 97n);
  return `CZ${String(check).padStart(2, "0")}${bban}`;
}

export function ownSupplier(env: Env = process.env): OwnInvoiceSupplier {
  const raw = bankConfig(env);
  const bank = { account: raw.account, iban: raw.iban ?? czIbanFromAccount(raw.account) };
  return {
    name: OPERATOR.name,
    address: OPERATOR.address,
    ico: OPERATOR.ico,
    registration: "Fyzická osoba zapsaná v živnostenském rejstříku",
    vatNote: "Nejsem plátce DPH",
    bankAccount: bank.account,
    iban: bank.iban,
    email: OPERATOR.email,
    phone: OPERATOR.phone,
    web: "begina.cz",
  };
}

function asMethod(value: string | null | undefined): OwnPaymentMethod | null {
  return value === "card" || value === "bank_transfer" || value === "cash" ? value : null;
}

/** Snímek e-shopové faktury z hotového návrhu (draft.ts) — objednávka je uhrazená. */
export function snapshotFromDraft(draft: InvoiceDraft, env: Env = process.env): OwnInvoiceSnapshot {
  const c = draft.customer;
  const issueDate = draft.issueDate ?? draft.paidDate ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  let delivery: string | null = null;
  if (draft.delivery?.kind === "pickup") delivery = "Osobní odběr – Zahradní Bistro Begina, Vitice 119";
  else if (draft.delivery?.address) {
    const a = draft.delivery.address;
    const who = [draft.delivery.company, draft.delivery.name].filter(Boolean).join(", ");
    delivery = `${who ? `${who}, ` : ""}${a.street}, ${formatZip(a.zip)} ${a.city}`;
  }
  return {
    version: 1,
    kind: "invoice",
    correctsNumber: null,
    issueDate,
    dueDate: draft.dueDate ?? issueDate,
    paidDate: draft.paidDate ?? issueDate,
    paymentMethod: asMethod(draft.paymentMethod),
    vs: draft.vs,
    orderReference: draft.orderReference,
    supplier: ownSupplier(env),
    customer: {
      kind: c.kind,
      name: c.name?.trim() || "Zákazník e-shopu",
      contactPerson: c.kind === "company" ? c.contactPerson : null,
      street: c.address?.street ?? null,
      city: c.address?.city ?? null,
      zip: c.address?.zip ?? null,
      country: c.address ? "Česká republika" : null,
      ico: c.ico,
      dic: c.dic,
      email: c.email,
    },
    delivery,
    lines: draft.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceKc: l.unitPriceKc, totalKc: l.totalKc })),
    totalKc: draft.totalKc,
    note: null,
  };
}

/** Kontrola snímku před vystavením — prázdný seznam = v pořádku. */
export function snapshotProblems(s: OwnInvoiceSnapshot): string[] {
  const problems: string[] = [];
  if (s.lines.length === 0) problems.push("Faktura nemá žádné položky.");
  const sum = s.lines.reduce((acc, l) => acc + l.totalKc, 0);
  if (sum !== s.totalKc) problems.push(`Součet položek (${sum} Kč) nesedí s celkem (${s.totalKc} Kč).`);
  if (s.kind === "invoice" && s.totalKc <= 0) problems.push("Faktura musí mít kladnou částku.");
  if (s.kind === "credit_note" && (s.totalKc >= 0 || !s.correctsNumber)) problems.push("Dobropis musí mít zápornou částku a číslo opravované faktury.");
  if (!s.customer.name.trim()) problems.push("Chybí odběratel.");
  if (s.customer.ico && !/^\d{8}$/.test(s.customer.ico)) problems.push("IČO odběratele musí mít 8 číslic.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(s.dueDate)) problems.push("Neplatné datum vystavení nebo splatnosti.");
  if (s.dueDate < s.issueDate) problems.push("Splatnost je dřív než vystavení.");
  if (s.vs && !/^\d{1,10}$/.test(s.vs)) problems.push("Variabilní symbol musí mít 1–10 číslic.");
  if (!s.supplier.ico || !s.supplier.address) problems.push("Chybí údaje dodavatele.");
  return problems;
}

/** „1 025 Kč“ (mezery po tisících, záporné „−1 025 Kč“). */
export function formatKc(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const [int, dec] = abs.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped}${dec === "00" ? "" : `,${dec}`} Kč`;
}

/** „2026-11-23“ → „23. 11. 2026“ */
export function formatCzDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

export function ownInvoiceFilename(number: string, kind: OwnInvoiceSnapshot["kind"] = "invoice"): string {
  return `${kind === "credit_note" ? "Dobropis" : "Faktura"}-${number}.pdf`;
}

// ---------------------------------------------------------------- PDF

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // okraj
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.42, 0.42, 0.42);
const GREEN = rgb(0.18, 0.24, 0.13);
const LINE = rgb(0.85, 0.85, 0.85);
const RED = rgb(0.75, 0.1, 0.1);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** „37001“ → „370 01“ */
export function formatZip(zip: string | null): string | null {
  if (!zip) return zip;
  const d = zip.replace(/\s/g, "");
  return /^\d{5}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3)}` : zip;
}

function quantityText(q: number): string {
  return Number.isInteger(q) ? String(q) : String(q).replace(".", ",");
}

export async function renderOwnInvoicePdf(snapshot: OwnInvoiceSnapshot, number: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_REGULAR, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_BOLD, "base64"), { subset: true });
  const logo = await doc.embedPng(Buffer.from(LOGO_BEGINA_PNG_BASE64, "base64"));
  const title = snapshot.kind === "credit_note" ? "Dobropis" : "Faktura";
  doc.setTitle(`${title} ${number} – Begina`);
  doc.setAuthor(snapshot.supplier.name);
  doc.setProducer("MojeBegina");
  doc.setCreator("MojeBegina");

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  const text = (p: PDFPage, s: string, x: number, y: number, size = 9.5, font = regular, color = INK) =>
    p.drawText(s, { x, y, size, font, color });
  const right = (p: PDFPage, s: string, xr: number, y: number, size = 9.5, font = regular, color = INK) =>
    p.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y, size, font, color });

  // hlavička: logo vlevo, nadpis a číslo vpravo
  const logoH = 58;
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: M, y: A4.h - M - logoH, width: logoW, height: logoH });
  text(page, "BEGINA.CZ", M + logoW + 10, A4.h - M - 26, 15, bold, GREEN);
  text(page, "Když rozhoduje chuť", M + logoW + 10, A4.h - M - 41, 9, regular, MUTED);
  right(page, title, A4.w - M, A4.h - M - 22, 22, bold, INK);
  right(page, `č. ${number}`, A4.w - M, A4.h - M - 42, 13, bold, GREEN);
  if (snapshot.kind === "credit_note" && snapshot.correctsNumber) {
    right(page, `k faktuře č. ${snapshot.correctsNumber}`, A4.w - M, A4.h - M - 57, 9.5, regular, MUTED);
  }

  // dodavatel / odběratel
  let y = A4.h - M - logoH - 34;
  const colW = (A4.w - 2 * M - 24) / 2;
  const xR = M + colW + 24;
  text(page, "DODAVATEL", M, y, 8, bold, MUTED);
  text(page, "ODBĚRATEL", xR, y, 8, bold, MUTED);
  y -= 15;
  const s = snapshot.supplier;
  const supplierLines = [
    { t: s.name, f: bold },
    { t: s.address, f: regular },
    { t: `IČO: ${s.ico}`, f: regular },
    { t: s.vatNote, f: regular },
    { t: s.registration, f: regular },
  ];
  const c = snapshot.customer;
  const customerLines: { t: string; f: PDFFont }[] = [{ t: c.name, f: bold }];
  if (c.contactPerson && c.contactPerson !== c.name) customerLines.push({ t: c.contactPerson, f: regular });
  if (c.street) customerLines.push({ t: c.street, f: regular });
  if (c.zip || c.city) customerLines.push({ t: [formatZip(c.zip), c.city].filter(Boolean).join(" "), f: regular });
  if (c.country && c.country !== "Česká republika") customerLines.push({ t: c.country, f: regular });
  if (c.ico) customerLines.push({ t: `IČO: ${c.ico}`, f: regular });
  if (c.dic) customerLines.push({ t: `DIČ: ${c.dic}`, f: regular });
  let yL = y;
  for (const l of supplierLines) for (const w of wrap(l.t, l.f, 9.5, colW)) { text(page, w, M, yL, 9.5, l.f); yL -= 13.5; }
  let yR = y;
  for (const l of customerLines) for (const w of wrap(l.t, l.f, 9.5, colW)) { text(page, w, xR, yR, 9.5, l.f); yR -= 13.5; }
  y = Math.min(yL, yR) - 14;

  // údaje dokladu
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: A4.w - M, y: y + 6 }, thickness: 0.7, color: LINE });
  y -= 10;
  const facts: [string, string][] = [
    ["Datum vystavení", formatCzDay(snapshot.issueDate)],
    ["Datum splatnosti", formatCzDay(snapshot.dueDate)],
  ];
  if (snapshot.paymentMethod) facts.push(["Způsob úhrady", PAYMENT_METHOD_LABEL[snapshot.paymentMethod]]);
  const vs = snapshot.vs ?? (snapshot.kind === "invoice" ? number : null);
  if (vs) facts.push(["Variabilní symbol", vs]);
  if (snapshot.orderReference) facts.push(["Číslo objednávky", snapshot.orderReference]);
  // účet a IBAN jen u neuhrazené faktury převodem (uhrazená je nepotřebuje)
  const unpaidTransfer = snapshot.paidDate === null && snapshot.paymentMethod === "bank_transfer";
  if (unpaidTransfer && s.bankAccount) facts.push(["Bankovní účet", s.bankAccount]);
  if (unpaidTransfer && s.iban) facts.push(["IBAN", formatIban(s.iban)]);
  const half = Math.ceil(facts.length / 2);
  facts.forEach(([k, v], i) => {
    const x = i < half ? M : xR;
    const yy = y - (i % half) * 15;
    text(page, k, x, yy, 9, regular, MUTED);
    const maxW = (i < half ? xR - 12 : A4.w - M) - (x + 105);
    let size = 9.5;
    while (size > 7 && bold.widthOfTextAtSize(v, size) > maxW) size -= 0.5;
    text(page, v, x + 105, yy, size, bold);
  });
  y -= half * 15 + 14;

  // položky
  const xQty = A4.w - M - 210;
  const xUnit = A4.w - M - 95;
  const xTot = A4.w - M;
  const nameW = xQty - M - 40;
  page.drawRectangle({ x: M, y: y - 6, width: A4.w - 2 * M, height: 20, color: rgb(0.93, 0.94, 0.92) });
  text(page, "Položka", M + 6, y, 9, bold, GREEN);
  right(page, "Množství", xQty, y, 9, bold, GREEN);
  right(page, "Cena za kus", xUnit, y, 9, bold, GREEN);
  right(page, "Celkem", xTot - 6, y, 9, bold, GREEN);
  y -= 22;
  for (const line of snapshot.lines) {
    const names = wrap(line.name, regular, 9.5, nameW);
    if (y - names.length * 13 < M + 120) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
    names.forEach((n, i) => text(page, n, M + 6, y - i * 13, 9.5));
    right(page, quantityText(line.quantity), xQty, y, 9.5);
    right(page, formatKc(line.unitPriceKc), xUnit, y, 9.5);
    right(page, formatKc(line.totalKc), xTot - 6, y, 9.5);
    y -= names.length * 13;
    page.drawLine({ start: { x: M, y: y + 7 }, end: { x: A4.w - M, y: y + 7 }, thickness: 0.4, color: LINE });
    y -= 9;
  }

  // celkem
  y -= 12;
  const paid = snapshot.paidDate !== null;
  const totalLabel = snapshot.kind === "credit_note" ? "Celkem k vrácení" : paid ? "Celkem" : "Celkem k úhradě";
  right(page, totalLabel, xUnit, y, 11, bold);
  right(page, formatKc(snapshot.totalKc), xTot - 6, y, 13, bold, GREEN);
  y -= 16;
  right(page, s.vatNote, xTot - 6, y, 8.5, regular, MUTED);
  y -= 20;
  if (paid && snapshot.kind === "invoice") {
    const method = snapshot.paymentMethod ? ` – ${PAYMENT_METHOD_LABEL[snapshot.paymentMethod].toLowerCase()}` : "";
    right(page, `Uhrazeno ${formatCzDay(snapshot.paidDate!)}${method}. Neplaťte.`, xTot - 6, y, 10, bold, RED);
    y -= 22;
  }

  // QR platba — jen neuhrazená faktura převodem
  if (!paid && snapshot.kind === "invoice" && snapshot.paymentMethod === "bank_transfer" && s.iban && vs) {
    const spayd = spaydString({
      iban: s.iban,
      amountKc: snapshot.totalKc,
      variableSymbol: vs,
      message: `Faktura ${number}`,
      paymentDate: new Date(`${snapshot.issueDate}T12:00:00Z`),
    });
    const png = await QRCode.toBuffer(spayd, { errorCorrectionLevel: "M", margin: 1, width: 300 });
    const qr = await doc.embedPng(png);
    const size = 96;
    if (y - size < M + 50) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
    page.drawImage(qr, { x: M, y: y - size, width: size, height: size });
    text(page, "QR Platba", M + size + 12, y - 16, 10, bold);
    text(page, "Naskenujte v bankovní aplikaci.", M + size + 12, y - 31, 9, regular, MUTED);
    y -= size + 16;
  }

  const extra: string[] = [];
  if (snapshot.delivery) extra.push(`Doručení: ${snapshot.delivery.replace(/, (\d{3})(\d{2}) /, ", $1 $2 ")}`);
  if (snapshot.note) extra.push(snapshot.note);
  for (const e of extra) {
    for (const w of wrap(e, regular, 9, A4.w - 2 * M)) {
      if (y < M + 40) {
        page = doc.addPage([A4.w, A4.h]);
        y = A4.h - M;
      }
      text(page, w, M, y, 9, regular, MUTED);
      y -= 12.5;
    }
    y -= 4;
  }

  // patička na každé stránce
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: A4.w - M, y: M + 18 }, thickness: 0.5, color: LINE });
    text(p, `${s.name} · IČO ${s.ico} · ${s.address} · ${s.email} · ${s.phone} · ${s.web}`, M, M + 5, 7.5, regular, MUTED);
    if (pages.length > 1) right(p, `${i + 1}/${pages.length}`, A4.w - M, M + 5, 7.5, regular, MUTED);
  });

  return doc.save();
}
