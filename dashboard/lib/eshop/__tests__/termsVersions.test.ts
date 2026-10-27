// Znění obchodních podmínek a jejich PDF: uchování znění platného při
// objednávce (neměnné otisky), formulář pro odstoupení, deterministické
// a čitelné PDF, trvalé adresy ke stažení.
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  CURRENT_TERMS,
  LEGACY_TERMS,
  TERMS_VERSIONS,
  findTermsVersion,
  termsPdfFilename,
  termsPdfPath,
  termsVersionForOrder,
} from "../content/termsVersions";
import { WITHDRAWAL_FORM_SENTENCE } from "../content/obchodniPodminky";
import { termsPdf, termsPlainText, termsTextSha256 } from "../legal/termsPdf";
import { publicEshopPath, route } from "@/lib/site/routing";

vi.mock("server-only", () => ({}));

/**
 * Otisky VŠECH znění, která kdy platila. Změna už platného znění = selhání:
 * zákazníci s ním souhlasili a jejich objednávky na něj odkazují. Nový text
 * patří do NOVÉHO znění (termsVersions.ts) s vlastním datem účinnosti — sem
 * se pak doplní jeho otisky.
 */
const FROZEN: Record<string, { text: string; pdf: string }> = {
  "2026-09-22": {
    text: "0b63a137c058a96afb212504bd41c79d68a828c2e932b44471a0380e64d40505",
    pdf: "551b7c877b446b258a310b8a145ffbcad42279e0b9f4c93d61f49c2f5369c6c0",
  },
  "2026-10-27": {
    text: "a876d0fd64c2e78edcb47de662f5f21cee336bed92ba487d9da6f6bd4260ae85",
    pdf: "3d6697668cfb642afc9873f342c9a5fd028317f3df0ce66b2fb0ab46a0a7ebda",
  },
};

describe("znění obchodních podmínek", () => {
  it("id = datum účinnosti, vzestupně, jedinečná; platné = poslední, bez záznamu = první", () => {
    const ids = TERMS_VERSIONS.map((v) => v.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CURRENT_TERMS).toBe(TERMS_VERSIONS[TERMS_VERSIONS.length - 1]);
    expect(LEGACY_TERMS.id).toBe("2026-09-22");
    expect(CURRENT_TERMS.withWithdrawalForm).toBe(true);
  });

  it("každé znění má zapsaný otisk textu i PDF a otisky sedí (už platné znění se nemění)", async () => {
    expect(Object.keys(FROZEN)).toEqual(TERMS_VERSIONS.map((v) => v.id));
    for (const version of TERMS_VERSIONS) {
      expect(termsTextSha256(version), `text ${version.id}`).toBe(FROZEN[version.id].text);
      expect((await termsPdf(version)).sha256, `PDF ${version.id}`).toBe(FROZEN[version.id].pdf);
    }
  });

  it("1. znění je beze změny proti dodanému textu: bez formuláře, účinnost 22. září 2026", () => {
    const text = termsPlainText(LEGACY_TERMS);
    expect(text).toContain("Tyto obchodní podmínky jsou platné a účinné od 22. září 2026.");
    expect(text).not.toContain("Vzorový formulář");
    expect(text).not.toContain(WITHDRAWAL_FORM_SENTENCE);
  });

  it("platné znění: věta v čl. VII a formulář podle NV 29/2023 Sb. s nepovinným číslem objednávky", () => {
    const text = termsPlainText(CURRENT_TERMS);
    expect(text).toContain(WITHDRAWAL_FORM_SENTENCE);
    expect(text).toContain(`Tyto obchodní podmínky jsou platné a účinné od ${CURRENT_TERMS.effectiveLabel}.`);
    const form = text.slice(text.indexOf("Příloha: Vzorový formulář pro odstoupení od smlouvy"));
    for (const line of [
      "(vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)",
      "Oznámení o odstoupení od smlouvy",
      "Adresát: Jaroslav Viner, Mostecká 273/21, 118 00 Praha 1, IČO: 74337297, e-mail: info@begina.cz",
      "Oznamuji/oznamujeme (*), že tímto odstupuji/odstupujeme (*) od smlouvy o nákupu tohoto zboží (*)/o poskytnutí těchto služeb (*):",
      "Číslo objednávky (nepovinné):",
      "Datum objednání (*)/datum obdržení (*):",
      "Jméno a příjmení spotřebitele/spotřebitelů:",
      "Adresa spotřebitele/spotřebitelů:",
      "Podpis spotřebitele/spotřebitelů (pouze pokud je tento formulář zasílán na listině):",
      "Datum:",
      "(*) Nehodící se škrtněte nebo údaje doplňte.",
    ]) {
      expect(form, line).toContain(line);
    }
  });

  it("znění k objednávce: zapsané id; bez záznamu nebo s neznámým id 1. znění", () => {
    expect(termsVersionForOrder(CURRENT_TERMS.id)).toBe(CURRENT_TERMS);
    expect(termsVersionForOrder("2026-09-22")).toBe(LEGACY_TERMS);
    expect(termsVersionForOrder(null)).toBe(LEGACY_TERMS);
    expect(termsVersionForOrder("2099-01-01")).toBe(LEGACY_TERMS);
    expect(findTermsVersion("../../etc/passwd")).toBeNull();
    expect(findTermsVersion("2026-10-27.pdf")).toBeNull();
  });
});

describe("PDF obchodních podmínek", () => {
  it("deterministické: stejné znění = stejné bajty i po novém načtení modulu", async () => {
    const first = await termsPdf(CURRENT_TERMS);
    vi.resetModules();
    const fresh = await import("../legal/termsPdf");
    const freshVersions = await import("../content/termsVersions");
    const second = await fresh.termsPdf(freshVersions.CURRENT_TERMS);
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });

  it("platné PDF: hlavička, metadata, vložený font s češtinou, formulář na poslední straně", async () => {
    const pdf = await termsPdf(CURRENT_TERMS);
    expect(pdf.filename).toBe(`obchodni-podminky-begina-${CURRENT_TERMS.id}.pdf`);
    expect(Buffer.from(pdf.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(Buffer.from(pdf.contentBase64, "base64").equals(Buffer.from(pdf.bytes))).toBe(true);
    expect(pdf.bytes.length).toBeLessThan(200_000);
    const doc = await PDFDocument.load(pdf.bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe(`Obchodní podmínky e-shopu Begina.cz (znění účinné od ${CURRENT_TERMS.effectiveLabel})`);
    expect(doc.getSubject()).toContain("vzorového formuláře pro odstoupení");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
    const raw = Buffer.from(pdf.bytes).toString("latin1");
    expect(raw).toContain("/FontFile2"); // font je vložený (ne jen odkaz) — čte se všude stejně
    expect(raw).toContain("BeginaPDFSans-Regular");
    expect(raw).toContain("BeginaPDFSans-Bold");
    expect(raw).not.toMatch(/Liberation/); // upravený font nesmí nést vyhrazené jméno (OFL)
  });

  it("1. znění má svoje PDF (bez formuláře) — i starší objednávka dostane přesně svoje znění", async () => {
    const pdf = await termsPdf(LEGACY_TERMS);
    expect(pdf.filename).toBe("obchodni-podminky-begina-2026-09-22.pdf");
    const doc = await PDFDocument.load(pdf.bytes, { updateMetadata: false });
    expect(doc.getSubject()).toBe("Obchodní podmínky");
    expect(pdf.sha256).not.toBe((await termsPdf(CURRENT_TERMS)).sha256);
  });
});

describe("PDF ke stažení: /obchodni-podminky/<znění>.pdf", () => {
  const call = async (soubor: string) => {
    const { GET } = await import("@/app/eshop/obchodni-podminky/[soubor]/route");
    return GET(new Request(`https://begina.cz/obchodni-podminky/${soubor}`), {
      params: Promise.resolve({ soubor }),
    } as RouteContext<"/eshop/obchodni-podminky/[soubor]">);
  };

  it("každé znění: 200, application/pdf, otisk v hlavičce, trvalá cache", async () => {
    for (const version of TERMS_VERSIONS) {
      const response = await call(`${version.id}.pdf`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("x-content-sha256")).toBe(FROZEN[version.id].pdf);
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(response.headers.get("content-disposition")).toContain(termsPdfFilename(version));
    }
  });

  it("neznámé znění nebo jiný soubor → 404", async () => {
    for (const soubor of ["2099-01-01.pdf", "2026-10-27", "2026-10-27.txt", "..%2F..%2Fetc.pdf"]) {
      expect((await call(soubor)).status, soubor).toBe(404);
    }
  });

  it("begina.cz: adresa PDF se přepíše na route handler; jiné tvary ne", () => {
    expect(publicEshopPath(termsPdfPath(CURRENT_TERMS))).toBe(`/eshop/obchodni-podminky/${CURRENT_TERMS.id}.pdf`);
    expect(route({ host: "begina.cz", pathname: termsPdfPath(CURRENT_TERMS), search: "", method: "GET" }, {})).toEqual({
      kind: "rewrite",
      path: `/eshop/obchodni-podminky/${CURRENT_TERMS.id}.pdf`,
    });
    expect(publicEshopPath("/obchodni-podminky/neco.pdf")).toBeNull();
    expect(publicEshopPath("/obchodni-podminky/2026-10-27.pdf/x")).toBeNull();
  });
});
