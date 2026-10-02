// ESHOP 1.0 — pojistky pro Production: testovací nastavení z Preview se
// nesmí projevit v ostrém provozu a naopak.
import { describe, expect, it } from "vitest";
import { storeMode } from "../storeMode";
import { emailConfig, resolveRecipients } from "../email/config";
import { stripeConfig } from "../stripe/config";
import { isOrderWriteEnabled } from "../orderWrite";

// Všechno, co dnes nastavujeme v Preview, omylem zkopírované do Production.
const PREVIEW_VARS = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  RESEND_API_KEY: "re_x",
  ESHOP_EMAIL_FROM: "Begina <objednavky@begina.cz>",
  ESHOP_EMAIL_INTERNAL_TO: "jaroslav@begina.test",
  ESHOP_EMAIL_TEST_RECIPIENTS: "jaroslav@begina.test",
};

describe("Production: bez výslovného zapnutí nic", () => {
  const prod = { VERCEL_ENV: "production", ...PREVIEW_VARS };

  it("neukládá, neplatí, neposílá; pruh „Náhled e-shopu“ zůstává", () => {
    expect(isOrderWriteEnabled(prod)).toBe(false);
    expect(stripeConfig(prod)).toBeNull();
    expect(emailConfig(prod)).toBeNull();
    expect(storeMode(prod)).toBe("readonly");
  });

  it("testovací Stripe klíč se v Production nepoužije ani po zapnutí", () => {
    expect(stripeConfig({ ...prod, ESHOP_ORDER_WRITE: "on", ESHOP_STRIPE_LIVE: "on" })).toBeNull();
  });

  it("po zapnutí e-mailů: ostrý provoz, seznam testovacích adres se ignoruje → žádné [TEST] ani přesměrování", () => {
    const config = emailConfig({ ...prod, ESHOP_ORDER_WRITE: "on", ESHOP_EMAIL_LIVE: "on" });
    expect(config?.testRecipients).toBeNull();
    expect(resolveRecipients(["jana@example.cz"], config!)).toEqual({ to: ["jana@example.cz"], withheld: [] });
  });

  it("po zapnutí zápisu: ostrý obchod bez pruhu „Náhled“", () => {
    expect(storeMode({ ...prod, ESHOP_ORDER_WRITE: "on" })).toBe("live");
  });
});

describe("Preview: přepínače pro Production nemají vliv", () => {
  const preview = { VERCEL_ENV: "preview", ...PREVIEW_VARS, ESHOP_EMAIL_LIVE: "on", ESHOP_STRIPE_LIVE: "on" };

  it("zůstává testovací režim: e-maily jen na testovací adresy, Stripe jen testovací klíč", () => {
    expect(emailConfig(preview)?.testRecipients).toEqual(["jaroslav@begina.test"]);
    expect(stripeConfig({ ...preview, STRIPE_SECRET_KEY: "sk_live_x" })).toBeNull();
    expect(storeMode(preview)).toBe("test");
  });
});
