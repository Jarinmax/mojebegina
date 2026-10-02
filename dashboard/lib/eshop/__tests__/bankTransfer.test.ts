// ESHOP 1.0 — převod: IBAN, splatnost, QR Platba (SPAYD), čtení QR zpět.
import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  bankConfig,
  formatIban,
  isTransferOverdue,
  normalizeIban,
  spaydString,
  transferDueAt,
  transferInfo,
} from "../bankTransfer";
import { qrPng, qrSvg } from "../qr";

const IBAN = "CZ6508000000192000145399"; // ukázkový IBAN České spořitelny (platný kontrolní součet)
const ORDERED = new Date("2026-10-02T10:00:00Z");

describe("IBAN a účet", () => {
  it("normalizuje mezery a malá písmena a ověří kontrolní součet", () => {
    expect(normalizeIban(" cz65 0800 0000 1920 0014 5399 ")).toBe(IBAN);
    expect(normalizeIban("CZ6508000000192000145398")).toBeNull(); // překlep v poslední číslici
    expect(normalizeIban("123456789/0100")).toBeNull();
    expect(normalizeIban(undefined)).toBeNull();
    expect(formatIban(IBAN)).toBe("CZ65 0800 0000 1920 0014 5399");
  });

  it("bez proměnných prostředí žádný účet; neplatný IBAN se nepoužije", () => {
    expect(bankConfig({})).toEqual({ account: null, iban: null });
    expect(bankConfig({ ESHOP_BANK_ACCOUNT: " 19-2000145399/0800 ", ESHOP_BANK_IBAN: "CZ65 0800 0000 1920 0014 5399" })).toEqual({
      account: "19-2000145399/0800",
      iban: IBAN,
    });
    expect(bankConfig({ ESHOP_BANK_IBAN: "CZ00 0000" })).toEqual({ account: null, iban: null });
  });
});

describe("splatnost 5 dní a „po splatnosti“", () => {
  const order = {
    channel: "eshop",
    paymentMethodCode: "prevod",
    paymentStatus: "unpaid",
    fulfillmentStatus: "new",
    orderedAt: ORDERED,
  };

  it("splatnost = objednání + 5 dní", () => {
    expect(transferDueAt(ORDERED).toISOString()).toBe("2026-10-07T10:00:00.000Z");
  });

  it("po splatnosti jen nezaplacený, nezrušený e-shopový převod", () => {
    const after = new Date("2026-10-07T10:00:01Z");
    expect(isTransferOverdue(order, new Date("2026-10-07T09:59:59Z"))).toBe(false);
    expect(isTransferOverdue(order, after)).toBe(true);
    expect(isTransferOverdue({ ...order, paymentStatus: "paid" }, after)).toBe(false);
    expect(isTransferOverdue({ ...order, fulfillmentStatus: "cancelled" }, after)).toBe(false);
    expect(isTransferOverdue({ ...order, paymentMethodCode: "karta" }, after)).toBe(false);
    expect(isTransferOverdue({ ...order, channel: "manual" }, after)).toBe(false);
  });
});

describe("QR Platba (SPAYD)", () => {
  it("formát podle standardu ČBA: účet, částka, měna, splatnost, VS, zpráva bez diakritiky", () => {
    expect(
      spaydString({ iban: IBAN, amountKc: 2076, variableSymbol: "900001", message: "Begina objednávka 900001 *test*", dueAt: transferDueAt(ORDERED) })
    ).toBe("SPD*1.0*ACC:CZ6508000000192000145399*AM:2076.00*CC:CZK*DT:20261007*X-VS:900001*MSG:BEGINA OBJEDNAVKA 900001 TEST");
  });

  it("splatnost podle českého času (objednávka těsně před půlnocí)", () => {
    const lateEvening = new Date("2026-10-02T21:30:00Z"); // 23:30 v Praze
    expect(spaydString({ iban: IBAN, amountKc: 1, variableSymbol: "1", message: "x", dueAt: transferDueAt(lateEvening) })).toContain(
      "DT:20261007"
    );
  });

  it("odmítne neplatný VS nebo částku", () => {
    const base = { iban: IBAN, amountKc: 100, variableSymbol: "900001", message: "x", dueAt: ORDERED };
    expect(() => spaydString({ ...base, variableSymbol: "12345678901" })).toThrow();
    expect(() => spaydString({ ...base, variableSymbol: "ABC" })).toThrow();
    expect(() => spaydString({ ...base, amountKc: 0 })).toThrow();
  });

  it("údaje k objednávce: QR jen s IBANem a číslem objednávky; jen nezaplacený převod", () => {
    const order = { id: "11348d18-506f-45b8-b65d-65df779471c7", orderNumber: 900001, totalKc: 2076, orderedAt: ORDERED, paymentMethodCode: "prevod", paymentStatus: "unpaid" };
    const bank = { account: "19-2000145399/0800", iban: IBAN };
    expect(transferInfo(order, bank)).toMatchObject({ variableSymbol: "900001", amountKc: 2076, spayd: expect.stringContaining("X-VS:900001") });
    expect(transferInfo({ ...order, orderNumber: null }, bank)).toMatchObject({ variableSymbol: null, spayd: null, message: "Begina objednavka 11348d18" });
    expect(transferInfo(order, { ...bank, iban: null })).toMatchObject({ spayd: null, account: "19-2000145399/0800" });
    expect(transferInfo(order, { account: null, iban: null })).toBeNull();
    expect(transferInfo({ ...order, paymentStatus: "paid" }, bank)).toBeNull();
    expect(transferInfo({ ...order, paymentMethodCode: "karta" }, bank)).toBeNull();
  });

  it("vykreslený QR (PNG pro e-mail) jde přečíst zpátky na přesně tentýž text; SVG pro stránku", async () => {
    const text = spaydString({ iban: IBAN, amountKc: 2076, variableSymbol: "900001", message: "Begina objednavka 900001", dueAt: transferDueAt(ORDERED) });
    const png = PNG.sync.read(await qrPng(text));
    expect(png.width).toBe(360);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(text);
    expect(await qrSvg(text)).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
});
