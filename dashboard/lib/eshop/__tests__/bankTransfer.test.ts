// ESHOP 1.0 — převod: IBAN, splatnost, QR Platba (SPAYD), čtení QR zpět.
import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  bankConfig,
  formatIban,
  formatPragueDate,
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
  it("formát podle standardu ČBA: účet, částka, měna, datum platby, VS, zpráva bez diakritiky", () => {
    expect(
      spaydString({ iban: IBAN, amountKc: 2076, variableSymbol: "900001", message: "Begina objednávka 900001 *test*", paymentDate: ORDERED })
    ).toBe("SPD*1.0*ACC:CZ6508000000192000145399*AM:2076.00*CC:CZK*DT:20261002*X-VS:900001*MSG:BEGINA OBJEDNAVKA 900001 TEST");
  });

  it("datum v QR = den vytvoření objednávky (3. 10. → 3. 10., 4. 10. → 4. 10.); interní splatnost zůstává +5 dní", () => {
    const order = { id: "11348d18-506f-45b8-b65d-65df779471c7", orderNumber: 900001, paymentVs: "70000001", totalKc: 2076, paymentMethodCode: "prevod", paymentStatus: "unpaid" };
    const bank = { account: "19-2000145399/0800", iban: IBAN };
    for (const [orderedAt, qrDate, due] of [
      ["2026-10-03T08:00:00Z", "20261003", "8. 10. 2026"],
      ["2026-10-04T15:00:00Z", "20261004", "9. 10. 2026"],
    ] as const) {
      const info = transferInfo({ ...order, orderedAt: new Date(orderedAt) }, bank)!;
      expect(info.spayd).toContain(`*DT:${qrDate}*`);
      expect(formatPragueDate(info.dueAt)).toBe(due);
      expect(info.qrPaymentDate).toEqual(new Date(orderedAt));
      // účet, částka a VS beze změny
      // VS = uložený payment_vs; zpráva nese číslo objednávky
      expect(info.spayd).toBe(`SPD*1.0*ACC:${IBAN}*AM:2076.00*CC:CZK*DT:${qrDate}*X-VS:70000001*MSG:BEGINA OBJEDNAVKA 900001`);
    }
  });

  it("datum v QR podle českého času (objednávka kolem půlnoci)", () => {
    const qr = (iso: string) => spaydString({ iban: IBAN, amountKc: 1, variableSymbol: "1", message: "x", paymentDate: new Date(iso) });
    expect(qr("2026-10-02T21:30:00Z")).toContain("DT:20261002"); // 23:30 v Praze 2. 10.
    expect(qr("2026-10-02T22:30:00Z")).toContain("DT:20261003"); // 0:30 v Praze 3. 10.
    expect(qr("2026-12-31T23:30:00Z")).toContain("DT:20270101"); // zimní čas: 0:30 v Praze 1. 1.
  });

  it("odmítne neplatný VS nebo částku", () => {
    const base = { iban: IBAN, amountKc: 100, variableSymbol: "900001", message: "x", paymentDate: ORDERED };
    expect(() => spaydString({ ...base, variableSymbol: "12345678901" })).toThrow();
    expect(() => spaydString({ ...base, variableSymbol: "ABC" })).toThrow();
    expect(() => spaydString({ ...base, amountKc: 0 })).toThrow();
  });

  it("údaje k objednávce: VS = uložený payment_vs (nikdy číslo objednávky); QR jen s IBANem a VS; jen nezaplacený převod", () => {
    const order = { id: "11348d18-506f-45b8-b65d-65df779471c7", orderNumber: 900001, paymentVs: "70000001", totalKc: 2076, orderedAt: ORDERED, paymentMethodCode: "prevod", paymentStatus: "unpaid" };
    const bank = { account: "19-2000145399/0800", iban: IBAN };
    expect(transferInfo(order, bank)).toMatchObject({
      variableSymbol: "70000001",
      amountKc: 2076,
      message: "Begina objednavka 900001",
      spayd: expect.stringContaining("X-VS:70000001"),
    });
    // starší objednávka bez VS: žádný QR ani VS (číslo objednávky se jako VS NEpoužije)
    expect(transferInfo({ ...order, paymentVs: null }, bank)).toMatchObject({ variableSymbol: null, spayd: null, message: "Begina objednavka 900001" });
    expect(transferInfo({ ...order, orderNumber: null }, bank)).toMatchObject({ variableSymbol: "70000001", message: "Begina objednavka 11348d18" });
    expect(transferInfo(order, { ...bank, iban: null })).toMatchObject({ spayd: null, account: "19-2000145399/0800" });
    expect(transferInfo(order, { account: null, iban: null })).toBeNull();
    expect(transferInfo({ ...order, paymentStatus: "paid" }, bank)).toBeNull();
    expect(transferInfo({ ...order, paymentMethodCode: "karta" }, bank)).toBeNull();
  });

  it("vykreslený QR (PNG pro e-mail) jde přečíst zpátky na přesně tentýž text; SVG pro stránku", async () => {
    const text = spaydString({ iban: IBAN, amountKc: 2076, variableSymbol: "900001", message: "Begina objednavka 900001", paymentDate: ORDERED });
    const png = PNG.sync.read(await qrPng(text));
    expect(png.width).toBe(360);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(text);
    expect(await qrSvg(text)).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
});
