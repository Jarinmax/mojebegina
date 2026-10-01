// ESHOP 1.0 — e-maily k objednávce: pojistky (Preview / Production),
// testovací příjemci, obsah e-mailů a volání Resend API (bez sítě).
import { describe, expect, it, vi } from "vitest";
import { emailConfig, parseEmailList, resolveRecipients } from "../email/config";
import { emailsFor } from "../email/orderEmails";
import { resendTransport } from "../email/resend";
import { customerOrderEmail, internalOrderEmail, orderReference, paymentStateLabel, type EmailOrder } from "../email/templates";

const PREVIEW = {
  VERCEL_ENV: "preview",
  RESEND_API_KEY: "re_test_123",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test, lucie@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "Jaroslav@Begina.test; lucie@begina.test",
};

describe("e-maily — kdy se vůbec posílají (pojistky)", () => {
  it("Preview se vším nastaveným: ano, v testovacím režimu jen na testovací adresy", () => {
    expect(emailConfig(PREVIEW)).toEqual({
      apiKey: "re_test_123",
      from: "Begina <objednavky@begina.cz>",
      replyTo: null,
      internalTo: ["jaroslav@begina.test", "lucie@begina.test"],
      testRecipients: ["jaroslav@begina.test", "lucie@begina.test"],
      bankAccount: null,
    });
  });

  it("Preview BEZ testovacích adres nepošle nic (testovací objednávka nesmí odejít zákazníkovi)", () => {
    expect(emailConfig({ ...PREVIEW, ESHOP_EMAIL_TEST_RECIPIENTS: "" })).toBeNull();
    expect(emailConfig({ ...PREVIEW, ESHOP_EMAIL_TEST_RECIPIENTS: "není-email" })).toBeNull();
    expect(emailConfig({ ...PREVIEW, VERCEL_ENV: undefined, ESHOP_EMAIL_TEST_RECIPIENTS: undefined })).toBeNull();
  });

  it("chybí klíč, odesílatel nebo je klíč nesmysl: nic", () => {
    expect(emailConfig({ ...PREVIEW, RESEND_API_KEY: "" })).toBeNull();
    expect(emailConfig({ ...PREVIEW, RESEND_API_KEY: "sk_test_x" })).toBeNull();
    expect(emailConfig({ ...PREVIEW, ESHOP_EMAIL_FROM: "" })).toBeNull();
  });

  it("Production: nic, dokud není ESHOP_ORDER_WRITE=on a ESHOP_EMAIL_LIVE=on; pak ostrý provoz", () => {
    const prod = { ...PREVIEW, VERCEL_ENV: "production" };
    expect(emailConfig(prod)).toBeNull();
    expect(emailConfig({ ...prod, ESHOP_ORDER_WRITE: "on" })).toBeNull();
    expect(emailConfig({ ...prod, ESHOP_EMAIL_LIVE: "on" })).toBeNull();
    expect(emailConfig({ ...prod, ESHOP_ORDER_WRITE: "on", ESHOP_EMAIL_LIVE: "on" })).toMatchObject({ testRecipients: null });
  });

  it("volitelné: odpovědi a číslo účtu", () => {
    expect(emailConfig({ ...PREVIEW, ESHOP_EMAIL_REPLY_TO: "info@begina.cz", ESHOP_BANK_ACCOUNT: " 123456789/0100 " })).toMatchObject({
      replyTo: "info@begina.cz",
      bankAccount: "123456789/0100",
    });
  });

  it("seznam adres: malá písmena, bez duplicit a neplatných položek", () => {
    expect(parseEmailList(" A@x.cz, a@x.cz;b@y.cz  nesmysl,, ")).toEqual(["a@x.cz", "b@y.cz"]);
  });
});

describe("e-maily — testovací příjemci", () => {
  const test = { testRecipients: ["jaroslav@begina.test", "lucie@begina.test"] };

  it("zákazník mimo seznam e-mail NEdostane — dostanou ho testovací adresy s informací, komu byl určen", () => {
    expect(resolveRecipients(["jana@example.cz"], test)).toEqual({
      to: ["jaroslav@begina.test", "lucie@begina.test"],
      withheld: ["jana@example.cz"],
    });
  });

  it("povolená adresa (tester objednává na svůj e-mail) dostane e-mail přímo", () => {
    expect(resolveRecipients(["Lucie@Begina.test"], test)).toEqual({ to: ["lucie@begina.test"], withheld: [] });
  });

  it("smíšený seznam: nepovolené adresy se vynechají", () => {
    expect(resolveRecipients(["jaroslav@begina.test", "cizi@example.cz"], test)).toEqual({
      to: ["jaroslav@begina.test"],
      withheld: ["cizi@example.cz"],
    });
  });

  it("ostrý provoz (Production): beze změny", () => {
    expect(resolveRecipients(["jana@example.cz"], { testRecipients: null })).toEqual({ to: ["jana@example.cz"], withheld: [] });
  });
});

describe("e-maily — které e-maily spouští která událost", () => {
  const order = (paymentMethodCode: string, paymentStatus = "unpaid") => ({ channel: "eshop", paymentMethodCode, paymentStatus });

  it("převod: potvrzení + interní upozornění hned po uložení; potvrzení platby nic", () => {
    expect(emailsFor(order("prevod"), "order_created")).toEqual(["customer_confirmation", "internal_new_order"]);
    expect(emailsFor(order("prevod", "paid"), "payment_confirmed")).toEqual([]);
  });

  it("karta: po uložení NIC, po potvrzení platby jedno potvrzení + interní upozornění", () => {
    expect(emailsFor(order("karta"), "order_created")).toEqual([]);
    expect(emailsFor(order("karta", "paid"), "payment_confirmed")).toEqual(["customer_confirmation", "internal_new_order"]);
    expect(emailsFor(order("karta", "unpaid"), "payment_confirmed")).toEqual([]);
  });

  it("ruční objednávka z MojeBegina: nikdy", () => {
    expect(emailsFor({ ...order("prevod"), channel: "manual" }, "order_created")).toEqual([]);
  });
});

const ORDER: EmailOrder = {
  id: "11348d18-506f-45b8-b65d-65df779471c7",
  orderNumber: null,
  contactName: "Jana <b>Nováková</b>",
  contactEmail: "jana@example.cz",
  recipientAddress: "Prvního pluku 14, 18600 Praha",
  shippingMethodCode: "rozvoz",
  shippingMethodLabel: "Chlazená přeprava",
  paymentMethodCode: "prevod",
  paymentMethodLabel: "Bankovní převod — platba předem",
  paymentStatus: "unpaid",
  subtotalKc: 1137,
  discountKc: 0,
  shippingKc: 99,
  totalKc: 1236,
  customerNote: "Prosím zvonit <2×>",
  items: [
    { name: "Kulajda", quantity: 2, unitPriceKc: 379, lineTotalKc: 758 },
    { name: "Dýňová polévka", quantity: 1, unitPriceKc: 379, lineTotalKc: 379 },
  ],
};
const CTX = { baseUrl: "https://preview.example", withheld: [], test: false };
const kc = (n: number) => `${new Intl.NumberFormat("cs-CZ").format(n)} Kč`;

describe("e-maily — obsah potvrzení pro zákazníka", () => {
  it("převod: přijetí, položky, doprava, celkem, způsob a stav platby, reference, odkaz — a NE „zaplaceno“", () => {
    const mail = customerOrderEmail(ORDER, { ...CTX, bankAccount: null });
    expect(mail.subject).toBe("Přijali jsme vaši objednávku 11348d18");
    for (const part of [
      "Begina ji přijala",
      "2× Kulajda",
      kc(758),
      "1× Dýňová polévka",
      "Chlazená přeprava — Prvního pluku 14, 18600 Praha",
      `Celkem: ${kc(1236)}`,
      "Způsob platby: Bankovní převod — platba předem",
      "Stav platby: Čeká na platbu převodem",
      "Objednávka: 11348d18",
      "Platební údaje pro převod vám pošleme",
      "https://preview.example/eshop/objednavka/11348d18-506f-45b8-b65d-65df779471c7",
    ]) {
      expect(mail.text).toContain(part);
    }
    // „po zaplacení“ smí, „zaplaceno / zaplacená / platbu jsme obdrželi“ ne.
    for (const body of [mail.subject, mail.text, mail.html]) {
      expect(body.toLowerCase()).not.toMatch(/zaplacen[oaá](?![\p{L}])|platbu jsme obdrželi/u);
    }
  });

  it("převod s číslem účtu: platební údaje včetně částky a zprávy pro příjemce", () => {
    const mail = customerOrderEmail(ORDER, { ...CTX, bankAccount: "123456789/0100" });
    expect(mail.text).toContain("Číslo účtu: 123456789/0100");
    expect(mail.text).toContain(`Částka: ${kc(1236)}`);
    expect(mail.text).toContain("Zpráva pro příjemce: Objednávka 11348d18");
  });

  it("karta zaplacená (po webhooku): jedno potvrzení se stavem „Zaplaceno kartou“, bez platebních údajů", () => {
    const paid = { ...ORDER, paymentMethodCode: "karta", paymentMethodLabel: "Kartou online", paymentStatus: "paid" };
    const mail = customerOrderEmail(paid, { ...CTX, bankAccount: "123456789/0100" });
    expect(mail.subject).toBe("Objednávka 11348d18 je zaplacená — děkujeme");
    expect(mail.text).toContain("Stav platby: Zaplaceno kartou");
    expect(mail.text).toContain("platbu jsme obdrželi");
    expect(mail.text).not.toContain("Číslo účtu");
  });

  it("karta NEzaplacená nikdy netvrdí „zaplaceno“", () => {
    const unpaid = { ...ORDER, paymentMethodCode: "karta", paymentMethodLabel: "Kartou online" };
    expect(paymentStateLabel(unpaid)).toBe("Čeká na platbu kartou");
    const mail = customerOrderEmail(unpaid, { ...CTX, bankAccount: null });
    for (const body of [mail.subject, mail.text, mail.html]) {
      expect(body.toLowerCase()).not.toMatch(/zaplacen[oaá](?![\p{L}])|platbu jsme obdrželi/u);
    }
  });

  it("osobní odběr: místo adresy kde si objednávku vyzvednout", () => {
    const pickup = { ...ORDER, recipientAddress: null, shippingMethodCode: "osobni-odber", shippingMethodLabel: "Osobní vyzvednutí — Zahradní Bistro Begina", shippingKc: 0 };
    const mail = customerOrderEmail(pickup, { ...CTX, bankAccount: null });
    expect(mail.text).toContain("Vitice 119");
    expect(mail.text).toContain("Osobní vyzvednutí — Zahradní Bistro Begina: zdarma");
  });

  it("text od zákazníka se v HTML escapuje", () => {
    const mail = customerOrderEmail(ORDER, { ...CTX, bankAccount: null });
    expect(mail.html).toContain("Jana &lt;b&gt;Nováková&lt;/b&gt;");
    expect(mail.html).toContain("Prosím zvonit &lt;2×&gt;");
    expect(mail.html).not.toContain("<b>Nováková</b>");
  });

  it("číslo objednávky (až se zapne číslování) má přednost před referencí", () => {
    expect(orderReference({ ...ORDER, orderNumber: 5101 })).toBe("5101");
    expect(customerOrderEmail({ ...ORDER, orderNumber: 5101 }, { ...CTX, bankAccount: null }).subject).toBe(
      "Přijali jsme vaši objednávku 5101"
    );
  });

  it("testovací režim: [TEST] v předmětu a pruh s adresou, kam by e-mail šel", () => {
    const mail = customerOrderEmail(ORDER, { ...CTX, test: true, withheld: ["jana@example.cz"], bankAccount: null });
    expect(mail.subject).toBe("[TEST] Přijali jsme vaši objednávku 11348d18");
    expect(mail.html).toContain("TESTOVACÍ E-MAIL");
    expect(mail.html).toContain("jana@example.cz");
    expect(mail.text).toContain("V ostrém provozu by šel na: jana@example.cz");
  });
});

describe("e-maily — interní upozornění pro Beginu", () => {
  it("jméno, částka, položky, doprava, stav platby, poznámka a odkaz na detail v MojeBegina", () => {
    const mail = internalOrderEmail(ORDER, CTX);
    expect(mail.subject).toBe(`Nová objednávka 11348d18 — ${kc(1236)} — Čeká na platbu převodem`);
    for (const part of [
      "Zákazník: Jana <b>Nováková</b>",
      `Částka: ${kc(1236)}`,
      "2× Kulajda",
      "Doprava: Chlazená přeprava — Prvního pluku 14, 18600 Praha",
      "Platba: Bankovní převod — platba předem — Čeká na platbu převodem",
      "Poznámka zákazníka: Prosím zvonit <2×>",
      "https://preview.example/rizeni-firmy/objednavky/11348d18-506f-45b8-b65d-65df779471c7",
    ]) {
      expect(mail.text).toContain(part);
    }
    expect(mail.html).toContain("Otevřít v MojeBegina");
  });

  it("zaplaceno kartou", () => {
    const paid = { ...ORDER, paymentMethodCode: "karta", paymentMethodLabel: "Kartou online", paymentStatus: "paid", customerNote: null };
    const mail = internalOrderEmail(paid, CTX);
    expect(mail.subject).toBe(`Nová objednávka 11348d18 — ${kc(1236)} — Zaplaceno kartou`);
    expect(mail.text).toContain("Poznámka zákazníka: —");
  });
});

describe("e-maily — Resend API", () => {
  const message = { from: "Begina <objednavky@begina.cz>", to: ["a@x.cz"], replyTo: "info@begina.cz", subject: "S", html: "<p>H</p>", text: "T" };

  it("POST na api.resend.com s klíčem, Idempotency-Key a tělem e-mailu", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const result = await resendTransport("re_test_123", fetchImpl as unknown as typeof fetch)(message, "eshop-x-1");
    expect(result).toEqual({ ok: true, id: "msg_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_123", "Idempotency-Key": "eshop-x-1" });
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Begina <objednavky@begina.cz>",
      to: ["a@x.cz"],
      reply_to: "info@begina.cz",
      subject: "S",
      html: "<p>H</p>",
      text: "T",
    });
  });

  it("chyba Resendu i výpadek sítě vrátí { ok: false } (žádná výjimka)", async () => {
    const rejected = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "Domain not verified" }), { status: 403 }));
    expect(await resendTransport("re_x", rejected as unknown as typeof fetch)(message, "k")).toEqual({
      ok: false,
      error: "Resend 403: Domain not verified",
    });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await resendTransport("re_x", down as unknown as typeof fetch)(message, "k")).toEqual({
      ok: false,
      error: "Resend nedostupný: fetch failed",
    });
  });
});
