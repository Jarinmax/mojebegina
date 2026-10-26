// ESHOP 1.0 — platba bankovním převodem: účet, splatnost, QR Platba.
// Čisté funkce bez I/O (QR obrázek kreslí lib/eshop/qr.ts).
//
// Účet se NEukládá v kódu — bere se z proměnných prostředí:
//   ESHOP_BANK_ACCOUNT  tuzemský tvar pro zobrazení, např. 123456789/0100
//   ESHOP_BANK_IBAN     IBAN pro QR platbu (ověřuje se kontrolní součet)
// Bez platného IBANu se QR neukazuje; bez uloženého VS (orders.payment_vs,
// řada 7xxxxxxx) taky ne — platba bez VS by nešla spárovat. Datum v QR = den vytvoření objednávky;
// interní splatnost (TRANSFER_DUE_DAYS) slouží jen pro „Po splatnosti“
// a text „Zaplaťte prosím do …“.
//
// QR Platba = český standard SPAYD (Short Payment Descriptor, ČBA), který
// čtou všechny české bankovní aplikace.

type Env = Record<string, string | undefined>;

/** Splatnost převodu (rozhodnutí vedení 2. 10. 2026). */
export const TRANSFER_DUE_DAYS = 5;
export const TRANSFER_PAYMENT_METHOD = "prevod";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BankConfig = { account: string | null; iban: string | null };

/** Mezery pryč, velká písmena; null = není platný IBAN (kontrolní součet mod 97). */
export function normalizeIban(raw: string | undefined): string | null {
  const iban = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1 ? iban : null;
}

/** „CZ65 0800 0000 1920 0014 5399“ */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function bankConfig(env: Env = process.env): BankConfig {
  const account = env.ESHOP_BANK_ACCOUNT?.trim() || null;
  return { account, iban: normalizeIban(env.ESHOP_BANK_IBAN) };
}

export function transferDueAt(orderedAt: Date): Date {
  return new Date(orderedAt.getTime() + TRANSFER_DUE_DAYS * DAY_MS);
}

/** Datum v české časové zóně, např. „7. 10. 2026“. */
export function formatPragueDate(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
}

type OverdueOrder = {
  channel: string;
  paymentMethodCode: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  orderedAt: Date;
};

/** E-shopová objednávka převodem, nezaplacená, nezrušená a po splatnosti. Nic se neruší automaticky. */
export function isTransferOverdue(order: OverdueOrder, now: Date = new Date()): boolean {
  return (
    order.channel === "eshop" &&
    order.paymentMethodCode === TRANSFER_PAYMENT_METHOD &&
    order.paymentStatus === "unpaid" &&
    order.fulfillmentStatus !== "cancelled" &&
    transferDueAt(order.orderedAt).getTime() < now.getTime()
  );
}

// SPAYD: hodnoty nesmí obsahovat „*“; zprávu píšeme bez diakritiky a velkými
// písmeny (některé bankovní aplikace diakritiku ve zprávě nezobrazí správně).
function spaydText(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,:/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

function yyyymmdd(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // 2026-10-07
  return parts.replaceAll("-", "");
}

export type SpaydInput = {
  iban: string;
  amountKc: number;
  variableSymbol: string;
  message: string;
  /**
   * Datum platby v QR (pole DT). Některé bankovní aplikace ho použijí jako
   * datum odeslání platby — proto vždy den vytvoření objednávky
   * (rozhodnutí vedení 3. 10. 2026), ne interní splatnost.
   */
  paymentDate: Date;
};

export function spaydString(input: SpaydInput): string {
  if (!/^\d{1,10}$/.test(input.variableSymbol)) throw new Error("Variabilní symbol musí mít 1–10 číslic.");
  if (!Number.isInteger(input.amountKc) || input.amountKc <= 0) throw new Error("Neplatná částka.");
  return [
    "SPD",
    "1.0",
    `ACC:${input.iban}`,
    `AM:${input.amountKc.toFixed(2)}`,
    "CC:CZK",
    `DT:${yyyymmdd(input.paymentDate)}`,
    `X-VS:${input.variableSymbol}`,
    `MSG:${spaydText(input.message, 60)}`,
  ].join("*");
}

export type TransferInfo = {
  account: string | null;
  iban: string | null;
  amountKc: number;
  /** uložený platební identifikátor objednávky (orders.payment_vs); null = starší objednávka bez VS */
  variableSymbol: string | null;
  /** zpráva pro příjemce (vždy — i bez VS jde objednávku dohledat) */
  message: string;
  /** interní splatnost (+5 dní): „Zaplaťte prosím do …“ a stav „Po splatnosti“ */
  dueAt: Date;
  /** datum platby v QR = den vytvoření objednávky (Europe/Prague) */
  qrPaymentDate: Date;
  /** text QR kódu; null = chybí IBAN nebo VS */
  spayd: string | null;
};

type TransferOrder = {
  id: string;
  orderNumber: number | null;
  paymentVs: string | null;
  totalKc: number;
  orderedAt: Date;
  paymentMethodCode: string | null;
  paymentStatus: string;
};

/**
 * Platební údaje pro nezaplacenou objednávku převodem; jinak null.
 * `amountKc` = kolik zbývá zaplatit (např. doplatek po převodu platby
 * ze stornované objednávky); bez něj celá částka objednávky. QR jen pro
 * celé koruny.
 */
export function transferInfo(order: TransferOrder, bank: BankConfig, amountKc: number = order.totalKc): TransferInfo | null {
  if (order.paymentMethodCode !== TRANSFER_PAYMENT_METHOD || order.paymentStatus !== "unpaid") return null;
  if (!bank.account && !bank.iban) return null;
  // VS = uložený payment_vs (nikdy se nedopočítává); zpráva pro příjemce
  // nese číslo objednávky, které zákazník vidí.
  const variableSymbol = order.paymentVs;
  const reference = order.orderNumber !== null ? String(order.orderNumber) : order.id.slice(0, 8);
  const message = `Begina objednavka ${reference}`;
  const dueAt = transferDueAt(order.orderedAt);
  const qrPaymentDate = order.orderedAt;
  if (amountKc <= 0) return null;
  const spayd =
    bank.iban && variableSymbol && Number.isInteger(amountKc)
      ? spaydString({ iban: bank.iban, amountKc, variableSymbol, message, paymentDate: qrPaymentDate })
      : null;
  return { account: bank.account, iban: bank.iban, amountKc, variableSymbol, message, dueAt, qrPaymentDate, spayd };
}
