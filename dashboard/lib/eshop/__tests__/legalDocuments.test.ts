// Obchodní podmínky na trvalém nosiči: verze přijatá u objednávky, jeden
// neměnný PDF balíček (podmínky + poučení + formulář), příloha potvrzení
// objednávky, stránka /odstoupeni-od-smlouvy a patička e-mailů s úplnou
// identifikací prodávajícího (lib/eshop/seller.ts — jediný zdroj).
// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { EmailMessage } from "../email/resend";
import { TERMS_BLOCKS, TERMS_EFFECTIVE } from "../content/obchodniPodminky";
import { PRIVACY_BLOCKS } from "../content/ochranaOsobnichUdaju";
import { buildLegalPdf } from "../legal/pdfBuilder";
import { CURRENT_LEGAL_VERSION, LEGAL_VERSIONS, legalAcceptance, legalPdf, legalPdfFilename } from "../legal/versions";
import { WITHDRAWAL_FORM_FIELDS, WITHDRAWAL_PAGE_BLOCKS } from "../legal/withdrawal";
import { SELLER, SELLER_IDENTITY_LINES, SELLER_PREMISES } from "../seller";
import { INFO_PAGES, LEGAL_PDF_PATH, OPERATOR } from "../infoPages";
import { customerCancellationEmail, customerOrderEmail, customerPaymentReceivedEmail, internalOrderEmail, sellerFooter } from "../email/templates";
import { route } from "@/lib/site/routing";

vi.mock("server-only", () => ({}));

const ROOT = path.join(__dirname, "../../..");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const MONTHS = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const czechDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
};

describe("prodávající — jeden zdroj údajů", () => {
  it("obchodní podmínky čl. I a GDPR čl. I = údaje z seller.ts, text beze změny", () => {
    expect(TERMS_BLOCKS[0].points![0].lines).toEqual([
      "Jaroslav Viner",
      "IČO: 74337297",
      "sídlo: Mostecká 273/21, 118 00 Praha 1",
      "e-mail: info@begina.cz",
      "telefon: +420 774 199 975",
      "dále jen „prodávající“,",
    ]);
    expect(TERMS_BLOCKS[0].points![0].lines!.slice(0, 5)).toEqual([...SELLER_IDENTITY_LINES]);
    expect(PRIVACY_BLOCKS[0].lines).toEqual([...SELLER_IDENTITY_LINES]);
    expect(SELLER_PREMISES).toBe("Zahradní Bistro Begina, Vitice 119, 281 06 Vitice, okres Kolín");
    expect(OPERATOR).toBe(SELLER);
  });

  it("nové soubory údaje prodávajícího natvrdo nepíšou", () => {
    for (const file of [
      "lib/eshop/legal/withdrawal.ts",
      "lib/eshop/legal/bundle.ts",
      "lib/eshop/legal/pdfBuilder.ts",
      "lib/eshop/email/templates.ts",
      "lib/eshop/infoPages.ts",
      "components/eshop/InfoPageView.tsx",
      "lib/eshop/content/obchodniPodminky.ts",
      "lib/eshop/content/ochranaOsobnichUdaju.ts",
    ]) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      for (const value of ["74337297", "Mostecká", "774 199 975", "info@begina.cz", "Jaroslav Viner", "Vitice 119"]) {
        expect(source.includes(value), `${file}: ${value}`).toBe(false);
      }
    }
  });
});

describe("verze dokumentů a neměnné PDF", { timeout: 60_000 }, () => {
  it("aktuální verze = datum účinnosti obchodních podmínek", () => {
    const current = LEGAL_VERSIONS[CURRENT_LEGAL_VERSION];
    expect(current.termsEffective).toBe(TERMS_EFFECTIVE);
    expect(czechDate(CURRENT_LEGAL_VERSION.slice(0, 10))).toBe(TERMS_EFFECTIVE);
    expect(legalAcceptance()).toEqual({ version: CURRENT_LEGAL_VERSION, sha256: current.sha256 });
  });

  it("každé uložené PDF odpovídá svému otisku (žádná verze se nezměnila)", async () => {
    for (const version of Object.values(LEGAL_VERSIONS)) {
      const bytes = Buffer.from(await version.load(), "base64");
      expect(sha(bytes), version.id).toBe(version.sha256);
    }
  });

  it("aktuální PDF = generátor nad dnešními texty (změna textů = nová verze, ne přepis)", async () => {
    const built = await buildLegalPdf(CURRENT_LEGAL_VERSION);
    expect(sha(built)).toBe(LEGAL_VERSIONS[CURRENT_LEGAL_VERSION].sha256);
  });

  it("jeden balíček: podmínky + poučení + formulář, metadata s verzí", async () => {
    const pdf = await legalPdf(CURRENT_LEGAL_VERSION);
    const doc = await PDFDocument.load(Buffer.from(pdf.contentBase64, "base64"), { updateMetadata: false });
    expect(doc.getTitle()).toBe(`Obchodní podmínky e-shopu Begina.cz — verze ${CURRENT_LEGAL_VERSION}`);
    expect(doc.getAuthor()).toBe(SELLER.name);
    expect(doc.getSubject()).toBe("Obchodní podmínky, poučení o odstoupení od smlouvy a vzorový formulář");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(pdf.filename).toBe(legalPdfFilename(CURRENT_LEGAL_VERSION));
    expect(pdf.filename).toBe("obchodni-podminky-begina-2026-09-22.pdf");
  });

  it("bez evidované verze (starší objednávka) → aktuální; neznámá verze → chyba, nikdy jiné podmínky", async () => {
    expect((await legalPdf(null)).versionId).toBe(CURRENT_LEGAL_VERSION);
    await expect(legalPdf("1999-01-01")).rejects.toThrow(/Neznámá verze/);
  });
});

describe("stránka /odstoupeni-od-smlouvy a PDF ke stažení", () => {
  it("poučení = čl. VII obchodních podmínek beze změny, vzorový formulář, adresát z seller.ts", () => {
    const article = TERMS_BLOCKS.find((b) => b.heading?.startsWith("VII."))!;
    expect(WITHDRAWAL_PAGE_BLOCKS[0].points).toBe(article.points);
    const form = WITHDRAWAL_PAGE_BLOCKS.at(-1)!;
    expect(form.heading).toBe("Vzorový formulář pro odstoupení od smlouvy");
    expect(form.items).toEqual([...WITHDRAWAL_FORM_FIELDS]);
    expect(form.lines).toEqual([SELLER.name, SELLER.address, `e-mail: ${SELLER.email}`, `telefon: ${SELLER.phone}`]);
    expect(INFO_PAGES.withdrawal.path).toBe("/odstoupeni-od-smlouvy");
    expect(INFO_PAGES.withdrawal.downloads).toEqual([{ path: LEGAL_PDF_PATH, label: expect.stringMatching(/PDF/) }]);
    expect(INFO_PAGES.terms.downloads?.[0].path).toBe(LEGAL_PDF_PATH);
  });

  it("begina.cz: stránka i PDF projdou (přepis do app/eshop), stejně na moje.begina.cz/eshop", () => {
    for (const p of ["/odstoupeni-od-smlouvy", "/obchodni-podminky.pdf"]) {
      expect(route({ host: "begina.cz", pathname: p, search: "", method: "GET" }, {})).toEqual({ kind: "rewrite", path: `/eshop${p}` });
    }
  });

  it("route handler vrátí přesně PDF aktuální verze", async () => {
    const { GET } = await import("@/app/eshop/obchodni-podminky.pdf/route");
    const response = await GET();
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("obchodni-podminky-begina-2026-09-22.pdf");
    expect(sha(new Uint8Array(await response.arrayBuffer()))).toBe(LEGAL_VERSIONS[CURRENT_LEGAL_VERSION].sha256);
  });
});

const ORDER = {
  id: "0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11",
  orderNumber: 70000002,
  paymentVs: "70000002",
  contactName: "Jana Nováková",
  contactEmail: "jana@example.cz",
  recipientAddress: null,
  shippingMethodCode: "osobni-odber",
  shippingMethodLabel: "Osobní vyzvednutí",
  paymentMethodCode: "prevod",
  paymentMethodLabel: "Bankovní převod",
  paymentStatus: "unpaid",
  orderedAt: new Date("2026-10-11T10:00:00Z"),
  subtotalKc: 379,
  discountKc: 0,
  shippingKc: 0,
  totalKc: 379,
  customerNote: null,
  items: [{ name: "Kulajda", quantity: 1, unitPriceKc: 379, lineTotalKc: 379 }],
};
const CTX = { baseUrl: "https://moje.begina.cz", withheld: [], test: false };

describe("patička e-mailů a věta o příloze", () => {
  const expectFooter = (html: string, text: string) => {
    for (const value of [SELLER.name, `IČO ${SELLER.ico}`, SELLER.address, SELLER.email, SELLER.phone, SELLER_PREMISES]) {
      expect(text, value).toContain(value);
      expect(html, value).toContain(value);
    }
    expect(text).toContain("Odstoupení od smlouvy: https://moje.begina.cz/eshop/odstoupeni-od-smlouvy");
    expect(text).toContain("Obchodní podmínky: https://moje.begina.cz/eshop/obchodni-podminky");
    expect(html).toContain('href="https://moje.begina.cz/eshop/odstoupeni-od-smlouvy"');
  };

  it("potvrzení objednávky: úplná identifikace prodávajícího + odkaz na odstoupení + věta o PDF", () => {
    const email = customerOrderEmail(ORDER, { ...CTX, transfer: null, qrContentId: null, legalVersion: "2026-09-22" });
    expectFooter(email.html, email.text);
    expect(email.text).toContain("V příloze posíláme obchodní podmínky, poučení o odstoupení od smlouvy a vzorový formulář pro odstoupení (PDF, verze 2026-09-22)");
    const withoutPdf = customerOrderEmail(ORDER, { ...CTX, transfer: null, qrContentId: null, legalVersion: null });
    expect(withoutPdf.text).not.toContain("V příloze posíláme obchodní podmínky");
  });

  it("další e-maily zákazníkovi mají patičku, interní ne", () => {
    const paid = customerPaymentReceivedEmail({ ...ORDER, paymentStatus: "paid" }, { ...CTX, invoiceNumber: null, late: false });
    expectFooter(paid.html, paid.text);
    const cancelled = customerCancellationEmail(ORDER, { ...CTX, heldHal: 0 });
    expectFooter(cancelled.html, cancelled.text);
    const internal = internalOrderEmail(ORDER, { ...CTX });
    expect(internal.text).not.toContain("Prodávající:");
  });

  it("na begina.cz (po přepnutí) vedou odkazy na begina.cz", () => {
    const footer = sellerFooter({ baseUrl: "https://begina.cz" });
    expect(footer.text).toContain("Odstoupení od smlouvy: https://begina.cz/odstoupeni-od-smlouvy");
  });
});

describe("verze přijatá u objednávky a příloha potvrzení (neon-http → PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let sendOrderEmails: typeof import("../email/orderEmails").sendOrderEmails;
  let saveOrder: () => Promise<string>;
  const sent: (EmailMessage & { key: string })[] = [];
  const transport = async (message: EmailMessage, key: string) => {
    sent.push({ ...message, key });
    return { ok: true as const, id: `msg_${sent.length}` };
  };
  const config = {
    apiKey: "re_test",
    from: "Begina <objednavky@begina.cz>",
    replyTo: null,
    internalTo: ["jaroslav@begina.test"],
    testRecipients: null,
  };

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    ({ sendOrderEmails } = await import("../email/orderEmails"));
    const { validateCheckoutInput } = await import("../checkout");
    const { saveEshopOrder } = await import("../orderWrite");
    const { catalogIndex } = await import("./helpers/catalogFixture");
    saveOrder = async () => {
      const checkout = validateCheckoutInput(
        {
          cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]),
          name: "Jana Nováková",
          email: "jana@example.cz",
          phone: "+420 777 123 456",
          shippingMethodId: "osobni-odber",
          paymentMethodId: "prevod",
          street: "",
          city: "",
          zip: "",
          note: "",
          termsAccepted: true,
          ageConfirmed: false,
        },
        catalogIndex
      );
      if (!checkout.ok) throw new Error(checkout.error);
      const id = randomUUID();
      const saved = await saveEshopOrder(db, id, checkout.value);
      if (!saved.ok) throw new Error(saved.error);
      return id;
    };
  }, 60_000);

  const created = async (orderId: string) =>
    (await db.execute(sql`SELECT metadata FROM order_activity WHERE order_id = ${orderId} AND kind = 'created'`)).rows[0]
      .metadata as Record<string, unknown>;

  it("objednávka uloží verzi platnou v okamžiku odeslání (bez migrace — historie objednávky)", async () => {
    const id = await saveOrder();
    expect((await created(id)).legal).toEqual(legalAcceptance());
  });

  it("potvrzení objednávky má v příloze PDF přijaté verze; interní upozornění ne; opakování nic nepošle", async () => {
    sent.length = 0;
    const id = await saveOrder();
    await sendOrderEmails(db, id, "order_created", "https://moje.begina.cz", { config, transport });
    const customer = sent.find((m) => m.to.includes("jana@example.cz"))!;
    const internal = sent.find((m) => m.to.includes("jaroslav@begina.test"))!;
    const expected = await legalPdf(CURRENT_LEGAL_VERSION);
    expect(customer.attachments).toEqual([{ filename: "obchodni-podminky-begina-2026-09-22.pdf", contentBase64: expected.contentBase64 }]);
    expect(customer.text).toContain("(PDF, verze 2026-09-22)");
    expect(customer.text).toContain("Odstoupení od smlouvy: https://moje.begina.cz/eshop/odstoupeni-od-smlouvy");
    expect(internal.attachments ?? []).toEqual([]);
    const [record] = (
      await db.execute(sql`SELECT metadata FROM order_activity WHERE order_id = ${id} AND kind = 'email_sent' AND metadata->>'template' = 'customer_confirmation'`)
    ).rows;
    expect(record.metadata.legal).toEqual({ version: CURRENT_LEGAL_VERSION, sha256: expected.sha256 });

    await sendOrderEmails(db, id, "order_created", "https://moje.begina.cz", { config, transport });
    expect(sent.filter((m) => m.to.includes("jana@example.cz"))).toHaveLength(1);
  });

  it("potvrzení o zaplacení PDF podmínek znovu nepřikládá", async () => {
    sent.length = 0;
    const id = await saveOrder();
    await db.execute(sql`UPDATE orders SET payment_status = 'paid' WHERE id = ${id}`);
    await sendOrderEmails(db, id, "payment_marked_paid", "https://moje.begina.cz", { config, transport });
    const paid = sent.find((m) => m.to.includes("jana@example.cz"))!;
    expect(paid.subject).toMatch(/Platbu za objednávku/);
    expect(paid.attachments ?? []).toEqual([]);
    expect(paid.text).toContain(`Prodávající: ${SELLER.name}`);
  });

  it("náhradní objednávka dostane verzi přijatou u původní objednávky", async () => {
    sent.length = 0;
    const original = await saveOrder();
    const replacement = await saveOrder();
    await db.execute(sql`
      UPDATE order_activity SET metadata = jsonb_build_object('channel', 'eshop', 'replacementOfOrderId', ${original}::text)
      WHERE order_id = ${replacement} AND kind = 'created'`);
    await sendOrderEmails(db, replacement, "replacement_created", "https://moje.begina.cz", {
      config,
      transport,
      replacement: { fromReference: "70000001", receivedHal: 37900 },
    });
    const email = sent.find((m) => m.to.includes("jana@example.cz"))!;
    expect(email.attachments?.[0].filename).toBe("obchodni-podminky-begina-2026-09-22.pdf");
  });
});
