// Zadání Lucie 8. 11. 2026: jednoduché označení balení, úplné fakturační
// a doručovací údaje v pokladně a jasně oddělené bloky v e-mailech.
import { describe, expect, it } from "vitest";
import { displayItemName, simplePackageLabel } from "../packageLabel";
import { normalizeIco, validateCheckoutInput as validateWith, type CheckoutInput } from "../checkout";
import { billingBlock, contactBlock, deliveryBlock, type OrderPartiesSource } from "../orderParties";
import { customerOrderEmail, internalOrderEmail, type EmailOrder } from "../email/templates";
import { buildEshopOrderRows } from "../orderWrite";
import { buildInvoiceDraft } from "../invoicing/draft";
import { catalogIndex } from "./helpers/catalogFixture";

const validate = (input: CheckoutInput) => validateWith(input, catalogIndex);

function input(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "rozvoz",
    paymentMethodId: "prevod",
    billingStreet: "Prvního pluku 14",
    billingCity: "Praha",
    billingZip: "18600",
    billingCountry: "Česká republika",
    companyPurchase: false,
    billingCompany: "",
    billingIco: "",
    billingDic: "",
    deliverySameAsBilling: true,
    recipientName: "",
    recipientCompany: "",
    street: "",
    city: "",
    zip: "",
    recipientPhone: "",
    note: "",
    termsAccepted: true,
    ageConfirmed: false,
    ...overrides,
  };
}

describe("označení balení", () => {
  it("štítek = jen množství s jednotkou, jednotky se nezamění", () => {
    expect(simplePackageLabel("3 l Rodinná zásoba (bag-in-box)")).toBe("3 l");
    expect(simplePackageLabel("500 ml Praktické balení")).toBe("500 ml");
    expect(simplePackageLabel("750 g Praktické balení")).toBe("750 g");
    expect(simplePackageLabel("750 ml")).toBe("750 ml");
    expect(simplePackageLabel("3 l")).toBe("3 l");
    expect(simplePackageLabel("Dárkové balení")).toBe("Dárkové balení");
  });

  it("názvy položek starších objednávek se zobrazí zkráceně", () => {
    expect(displayItemName("Dýňová polévka — 3 l Rodinná zásoba (bag-in-box)")).toBe("Dýňová polévka – 3 l");
    expect(displayItemName("Svařák Deluxe — 500 ml Praktické balení")).toBe("Svařák Deluxe – 500 ml");
    expect(displayItemName("Šípkový sirup — 750 g Praktické balení")).toBe("Šípkový sirup – 750 g");
    expect(displayItemName("Kulajda – 3 l")).toBe("Kulajda – 3 l");
    // ruční / B2B položky bez balení zůstávají
    expect(displayItemName("Rozvoz — Praha 4")).toBe("Rozvoz — Praha 4");
    expect(displayItemName("Polévka dne")).toBe("Polévka dne");
  });

  it("nová objednávka ukládá název „Kulajda – 3 l“, cena a množství beze změny", () => {
    const result = validate(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.value.pricedCart.lines[0];
    expect(line.name).toMatch(/^Kulajda – \d+(,\d+)? (ml|l|g|kg)$/);
    expect(line.name).not.toMatch(/Rodinná|bag-in-box|Praktické/i);
    expect(line.quantity).toBe(2);
  });
});

describe("pokladna: fakturační a doručovací údaje", () => {
  it("soukromá osoba, doručení na fakturační údaje — převezmou se včetně telefonu", () => {
    const result = validate(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.billing).toEqual({
      name: "Jana Nováková",
      company: null,
      street: "Prvního pluku 14",
      city: "Praha",
      zip: "186 00",
      country: "Česká republika",
    });
    expect(result.value.delivery).toMatchObject({
      sameAsBilling: true,
      name: "Jana Nováková",
      street: "Prvního pluku 14",
      zip: "186 00",
      city: "Praha",
      country: "Česká republika",
      phone: "+420 777 123 456",
    });
  });

  it("fakturační adresa je povinná i u osobního odběru", () => {
    expect(validate(input({ shippingMethodId: "osobni-odber", billingStreet: "" })).ok).toBe(false);
    expect(validate(input({ shippingMethodId: "osobni-odber", billingStreet: "Prvního pluku" }))).toEqual({
      ok: false,
      error: "Ve fakturační adrese uveďte ulici (nebo obec) i číslo domu.",
    });
    const pickup = validate(input({ shippingMethodId: "osobni-odber" }));
    expect(pickup.ok).toBe(true);
    if (pickup.ok) {
      expect(pickup.value.delivery).toBeNull();
      expect(pickup.value.address).toBeNull();
      expect(pickup.value.billing.street).toBe("Prvního pluku 14");
    }
  });

  it("nákup na firmu: název a platné IČO povinné, DIČ nepovinné", () => {
    expect(validate(input({ companyPurchase: true, billingCompany: "", billingIco: "74337297" })).ok).toBe(false);
    expect(validate(input({ companyPurchase: true, billingCompany: "Bistro s.r.o.", billingIco: "74337298" }))).toEqual({
      ok: false,
      error: "Zadejte platné IČO firmy (8 číslic).",
    });
    expect(validate(input({ companyPurchase: true, billingCompany: "Bistro s.r.o.", billingIco: "74337297", billingDic: "12" })).ok).toBe(false);
    const ok = validate(input({ companyPurchase: true, billingCompany: "Bistro s.r.o.", billingIco: "743 37 297", billingDic: "cz 74337297" }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.billing.company).toEqual({ name: "Bistro s.r.o.", ico: "74337297", dic: "CZ74337297" });
    const noDic = validate(input({ companyPurchase: true, billingCompany: "Bistro s.r.o.", billingIco: "74337297" }));
    expect(noDic.ok && noDic.value.billing.company?.dic).toBeNull();
  });

  it("kontrolní číslice IČO (mod 11)", () => {
    expect(normalizeIco("74337297", "Česká republika")).toBe("74337297");
    expect(normalizeIco("27082440", "Česká republika")).toBe("27082440");
    expect(normalizeIco("27082441", "Česká republika")).toBeNull();
    expect(normalizeIco("1234567", "Česká republika")).toBeNull();
  });

  it("jiný příjemce: vlastní jméno, adresa v ČR a telefon povinné", () => {
    const other = { deliverySameAsBilling: false, recipientName: "Petr Novák", recipientCompany: "Kancelář Praha", street: "Matúškova 831/1", city: "Praha 4", zip: "149 00", recipientPhone: "+420 608 000 111" };
    expect(validate(input({ ...other, recipientName: "" }))).toEqual({ ok: false, error: "Vyplňte jméno a příjmení příjemce zásilky." });
    expect(validate(input({ ...other, recipientPhone: "" }))).toEqual({ ok: false, error: "Zadejte platný telefon příjemce pro doručení." });
    expect(validate(input({ ...other, zip: "811 01" })).ok).toBe(false);
    const ok = validate(input(other));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.delivery).toEqual({
        sameAsBilling: false,
        name: "Petr Novák",
        company: "Kancelář Praha",
        street: "Matúškova 831/1",
        city: "Praha 4",
        zip: "149 00",
        country: "Česká republika",
        phone: "+420 608 000 111",
      });
      expect(ok.value.billing.street).toBe("Prvního pluku 14");
    }
  });

  it("slovenská fakturační adresa: jde, ale doručit jen do ČR", () => {
    const sk = { billingCountry: "Slovensko", billingStreet: "Hlavná 1", billingCity: "Bratislava", billingZip: "811 01" };
    expect(validate(input({ ...sk, shippingMethodId: "osobni-odber" })).ok).toBe(true);
    expect(validate(input({ ...sk })).ok).toBe(false);
    expect(validate(input({ ...sk, billingZip: "186 00", shippingMethodId: "osobni-odber" })).ok).toBe(false);
    expect(validate(input({ billingCountry: "Německo" })).ok).toBe(false);
  });

  it("uložení: fakturační údaje, příjemce i kontakt jsou v objednávce", () => {
    const result = validate(
      input({ companyPurchase: true, billingCompany: "Bistro s.r.o.", billingIco: "74337297", deliverySameAsBilling: false, recipientName: "Petr Novák", street: "Matúškova 831/1", city: "Praha 4", zip: "14900", recipientPhone: "+420 608 000 111" })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const variants = new Map(result.value.pricedCart.lines.map((l) => [l.sku, { id: "00000000-0000-4000-8000-000000000001", priceKc: l.unitPriceKc }]));
    const built = buildEshopOrderRows("00000000-0000-4000-8000-0000000000aa", result.value, variants, new Date("2026-11-08T12:00:00Z"));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.rows.order).toMatchObject({
      contactName: "Jana Nováková",
      contactEmail: "jana@example.cz",
      contactPhone: "+420 777 123 456",
      billingName: "Jana Nováková",
      billingCompany: "Bistro s.r.o.",
      billingIco: "74337297",
      billingDic: null,
      billingStreet: "Prvního pluku 14",
      billingCity: "Praha",
      billingZip: "186 00",
      billingCountry: "Česká republika",
      recipientName: "Petr Novák",
      recipientCompany: null,
      recipientAddress: "Matúškova 831/1, 149 00 Praha 4",
      recipientPhone: "+420 608 000 111",
      deliverySameAsBilling: false,
    });
  });
});

const base: OrderPartiesSource = {
  contactName: "Jana Nováková",
  contactEmail: "jana@example.cz",
  contactPhone: "+420 777 123 456",
  recipientName: "Jana Nováková",
  recipientCompany: null,
  recipientAddress: "Prvního pluku 14, 186 00 Praha",
  recipientPhone: "+420 777 123 456",
  shippingMethodCode: "rozvoz",
  shippingMethodLabel: "Chlazená přeprava",
  billingName: "Jana Nováková",
  billingCompany: null,
  billingIco: null,
  billingDic: null,
  billingStreet: "Prvního pluku 14",
  billingCity: "Praha",
  billingZip: "186 00",
  billingCountry: "Česká republika",
  deliverySameAsBilling: true,
};

describe("bloky údajů", () => {
  it("soukromá osoba: doručovací údaje celé i když jsou shodné", () => {
    expect(billingBlock(base).lines).toEqual(["Jana Nováková", "Prvního pluku 14", "186 00 Praha", "Česká republika"]);
    expect(deliveryBlock(base)).toMatchObject({
      lines: ["Jana Nováková", "Prvního pluku 14", "186 00 Praha", "Česká republika", "Tel.: +420 777 123 456"],
      note: "Shodné s fakturačními údaji.",
      missing: [],
    });
    expect(contactBlock(base).lines).toEqual(["E-mail: jana@example.cz", "Telefon: +420 777 123 456"]);
  });

  it("firma: název, kontaktní osoba, IČO a DIČ", () => {
    const block = billingBlock({ ...base, billingCompany: "Bistro s.r.o.", billingIco: "74337297", billingDic: "CZ74337297" });
    expect(block.lines).toEqual([
      "Bistro s.r.o.",
      "Kontaktní osoba: Jana Nováková",
      "Prvního pluku 14",
      "186 00 Praha",
      "Česká republika",
      "IČO: 74337297",
      "DIČ: CZ74337297",
    ]);
  });

  it("osobní odběr: provozovna a vyzvednutí po domluvě místo adresy", () => {
    const block = deliveryBlock({ ...base, shippingMethodCode: "osobni-odber", recipientAddress: null });
    expect(block.lines.join(" | ")).toContain("Zahradní Bistro Begina");
    expect(block.lines.join(" | ")).toContain("Vitice 119, 281 06 Vitice");
    expect(block.lines).toContain("Vyzvednutí je možné po předchozí domluvě.");
    expect(block.missing).toEqual([]);
  });

  it("starší objednávka (jako 70000009): nic se nedohaduje, vypíše se, co chybí", () => {
    const legacy: OrderPartiesSource = {
      contactName: "Lenka Odrazilová",
      contactEmail: "lenka@example.cz",
      contactPhone: "+420 600 000 000",
      recipientName: "Lenka Odrazilová",
      recipientAddress: "Matúškova 831/1, 149 00 Praha 4-Háje",
      recipientPhone: "+420 600 000 000",
      shippingMethodCode: "rozvoz",
      shippingMethodLabel: "Chlazená přeprava",
    };
    const billing = billingBlock(legacy);
    expect(billing.lines).toEqual(["Lenka Odrazilová"]);
    expect(billing.missing).toEqual([
      "fakturační adresa (pokladna ji u této objednávky nezjišťovala)",
      "nákup na firmu (název, IČO, DIČ) se nezjišťoval",
    ]);
    expect(deliveryBlock(legacy).lines).toEqual([
      "Lenka Odrazilová",
      "Matúškova 831/1",
      "149 00 Praha 4-Háje",
      "Česká republika",
      "Tel.: +420 600 000 000",
    ]);
  });
});

const emailOrder: EmailOrder = {
  id: "00000000-0000-4000-8000-0000000000aa",
  orderNumber: 70000010,
  paymentVs: "70000010",
  ...base,
  billingCompany: "Bistro s.r.o.",
  billingIco: "74337297",
  billingDic: null,
  recipientName: "Petr Novák",
  recipientCompany: "Kancelář Praha",
  recipientAddress: "Matúškova 831/1, 149 00 Praha 4",
  recipientPhone: "+420 608 000 111",
  deliverySameAsBilling: false,
  paymentMethodCode: "prevod",
  paymentMethodLabel: "Bankovní převod",
  paymentStatus: "unpaid",
  orderedAt: new Date("2026-11-08T12:00:00Z"),
  subtotalKc: 2495,
  discountKc: 0,
  shippingKc: 99,
  totalKc: 2594,
  customerNote: null,
  items: [{ name: "Dýňová polévka — 3 l Rodinná zásoba (bag-in-box)", quantity: 5, unitPriceKc: 499, lineTotalKc: 2495 }],
};
const ctx = { baseUrl: "https://begina.cz", withheld: [], test: false };

describe("e-maily: oddělené bloky", () => {
  it("interní oznámení: Fakturační / Doručovací / Kontakt, doprava zvlášť bez adresy", () => {
    const mail = internalOrderEmail(emailOrder, ctx);
    for (const part of ["Fakturační údaje", "Doručovací údaje", "Kontakt zákazníka", "Bistro s.r.o.", "IČO: 74337297", "Petr Novák", "Kancelář Praha", "Tel.: +420 608 000 111", "E-mail: jana@example.cz"]) {
      expect(mail.html, part).toContain(part);
      expect(mail.text, part).toContain(part);
    }
    expect(mail.text).toContain("Doprava: Chlazená přeprava\n");
    expect(mail.text).not.toMatch(/Doprava: Chlazená přeprava — /);
  });

  it("potvrzení zákazníkovi má stejné rozlišení", () => {
    const mail = customerOrderEmail(emailOrder, { ...ctx, transfer: null, qrContentId: null });
    expect(mail.text).toContain("Fakturační údaje\nBistro s.r.o.");
    expect(mail.text).toContain("Doručovací údaje\nPetr Novák");
  });

  it("osobní odběr v e-mailu: provozovna a vyzvednutí po domluvě", () => {
    const mail = internalOrderEmail({ ...emailOrder, shippingMethodCode: "osobni-odber", shippingMethodLabel: "Osobní odběr – Zahradní Bistro Begina, Vitice 119", recipientAddress: null, deliverySameAsBilling: null, shippingKc: 0, totalKc: 2495 }, ctx);
    expect(mail.text).toContain("Doručovací údaje\nOsobní odběr – Zahradní Bistro Begina");
    expect(mail.text).toContain("Vyzvednutí je možné po předchozí domluvě.");
  });
});

describe("faktura podle fakturačních údajů", () => {
  const order = {
    id: "00000000-0000-4000-8000-0000000000aa",
    channel: "eshop",
    orderNumber: 70000010,
    paymentVs: "70000010",
    contactName: "Jana Nováková",
    contactEmail: "jana@example.cz",
    contactPhone: "+420 777 123 456",
    recipientName: "Petr Novák",
    recipientAddress: "Matúškova 831/1, 149 00 Praha 4",
    shippingMethodCode: "rozvoz",
    shippingMethodLabel: "Chlazená přeprava",
    subtotalKc: 2495,
    discountKc: 0,
    shippingKc: 99,
    totalKc: 2594,
    paidAt: new Date("2026-11-08T12:00:00Z"),
    billingName: "Jana Nováková",
    billingStreet: "Prvního pluku 14",
    billingCity: "Praha",
    billingZip: "186 00",
    billingCountry: "Česká republika",
  };
  const items = [{ name: "Dýňová polévka – 3 l", quantity: 5, unitPriceKc: 499, lineTotalKc: 2495, sku: "dynova-polevka" }];
  const payments = [{ id: "p1", source: "bank", externalId: "x", method: "bank_transfer", direction: "inflow", status: "succeeded", amountHal: 259400, occurredAt: new Date("2026-11-08T12:00:00Z") }];

  it("osoba: fakturační adresa z pokladny, ne adresa příjemce", () => {
    const { draft } = buildInvoiceDraft(order, items, payments, { numberSeriesId: null });
    expect(draft.customer).toMatchObject({ kind: "person", name: "Jana Nováková", address: { street: "Prvního pluku 14", zip: "18600", city: "Praha" } });
    expect(draft.delivery).toMatchObject({ name: "Petr Novák", address: { street: "Matúškova 831/1" } });
  });

  it("firma: faktura na firmu s IČO a DIČ", () => {
    const { draft, problems } = buildInvoiceDraft({ ...order, billingCompany: "Bistro s.r.o.", billingIco: "74337297", billingDic: "CZ74337297" }, items, payments, { numberSeriesId: null });
    expect(draft.customer).toMatchObject({ kind: "company", name: "Bistro s.r.o.", ico: "74337297", dic: "CZ74337297", contactPerson: "Jana Nováková" });
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  it("slovenská adresa: faktura se automaticky nevystaví", () => {
    const { problems } = buildInvoiceDraft({ ...order, billingCountry: "Slovensko", billingZip: "811 01", billingCity: "Bratislava" }, items, payments, { numberSeriesId: null });
    expect(problems.map((p) => p.code)).toContain("billing_country_unsupported");
  });
});

// Náhled e-mailů pro kontrolu na mobilu (jen s RENDER_MAIL_DIR, jinak nic):
// soukromá osoba, firma s jiným příjemcem, osobní odběr, starší objednávka.
describe.runIf(Boolean(process.env.RENDER_MAIL_DIR))("náhled e-mailů", () => {
  it("zapíše HTML", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const dir = process.env.RENDER_MAIL_DIR!;
    mkdirSync(dir, { recursive: true });
    const person: EmailOrder = { ...emailOrder, ...base, items: emailOrder.items };
    const pickup: EmailOrder = { ...person, shippingMethodCode: "osobni-odber", shippingMethodLabel: "Osobní odběr – Zahradní Bistro Begina, Vitice 119", recipientAddress: null, deliverySameAsBilling: null, shippingKc: 0, totalKc: 2495 };
    const legacy: EmailOrder = {
      ...person,
      orderNumber: 70000009,
      billingName: null, billingCompany: null, billingIco: null, billingDic: null, billingStreet: null, billingCity: null, billingZip: null, billingCountry: null,
      deliverySameAsBilling: null,
      contactName: "Lenka Odrazilová", recipientName: "Lenka Odrazilová", recipientAddress: "Matúškova 831/1, 149 00 Praha 4-Háje",
    };
    const cases: [string, EmailOrder][] = [["1-osoba", person], ["2-firma-jiny-prijemce", emailOrder], ["3-osobni-odber", pickup], ["4-starsi-70000009", legacy]];
    for (const [name, order] of cases) {
      writeFileSync(`${dir}/${name}-interni.html`, internalOrderEmail(order, ctx).html);
      writeFileSync(`${dir}/${name}-zakaznik.html`, customerOrderEmail(order, { ...ctx, transfer: null, qrContentId: null }).html);
    }
  });
});
