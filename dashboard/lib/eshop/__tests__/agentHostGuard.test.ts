// GPT/MCP pilot — samostatná pojistka e-shopu na pilotní doméně
// gpt-pilot.begina.cz (vedle 404 v proxy.ts): pokladna (stránka i serverová
// akce) a „Zaplatit znovu“ odmítnou běh podle Host i X-Forwarded-Host —
// dřív, než sáhnou na databázi nebo Stripe. Na jiných doménách beze změny.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Headers(), dbTouched: false, stripeTouched: false }));
const FAKE_DB = { fake: true };

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    state.dbTouched = true;
    return FAKE_DB;
  },
}));
vi.mock("@/lib/eshop/stripe/payment", () => ({
  CARD_PAYMENT_METHOD: "card",
  startCardPayment: async () => {
    state.stripeTouched = true;
    return { ok: true, url: "https://checkout.stripe.test/x" };
  },
  startCheckoutCardPayment: async () => {
    state.stripeTouched = true;
    return { ok: true, url: "https://checkout.stripe.test/x" };
  },
}));
vi.mock("@/lib/eshop/stripe/client", () => ({ getStripe: () => ({ checkout: { sessions: {} } }) }));

const ORDER_ID = "11348d18-506f-45b8-b65d-65df779471c7";

function setHeaders(values: Record<string, string>) {
  state.headers = new Headers(values);
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");
  state.dbTouched = false;
  state.stripeTouched = false;
});
afterEach(() => vi.unstubAllEnvs());

const AGENT_REQUESTS: Array<Record<string, string>> = [
  { host: "gpt-pilot.begina.cz" },
  { host: "GPT-PILOT.begina.cz:443" },
  { host: "gpt-pilot.begina.cz", "x-forwarded-host": "moje.begina.cz" },
  { host: "moje.begina.cz", "x-forwarded-host": "gpt-pilot.begina.cz" },
];

describe("pokladna na pilotní doméně", () => {
  it("stránka /eshop/pokladna → 404", async () => {
    const { default: CheckoutPage } = await import("@/app/eshop/pokladna/page");
    for (const headers of AGENT_REQUESTS) {
      setHeaders(headers);
      await expect(CheckoutPage(), JSON.stringify(headers)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    setHeaders({ host: "mojebegina-git-claude-upbeat-goodall-pj64t5-jarin-max.vercel.app" });
    await expect(CheckoutPage()).resolves.toBeTruthy();
  });

  it("serverová akce odeslání objednávky nic neuloží ani nespustí platbu", async () => {
    const { submitCheckoutAction } = await import("@/app/eshop/pokladna/actions");
    for (const headers of AGENT_REQUESTS) {
      setHeaders(headers);
      const form = new FormData();
      form.set("cart", JSON.stringify([{ sku: "x", quantity: 1 }]));
      expect(await submitCheckoutAction(null, form), JSON.stringify(headers)).toEqual({ error: "Objednávku se nepodařilo odeslat." });
    }
    expect(state.dbTouched).toBe(false);
    expect(state.stripeTouched).toBe(false);
  });

  it("„Zaplatit znovu“ nespustí platbu ani nesáhne do databáze", async () => {
    const { payAgainAction } = await import("@/app/eshop/objednavka/[id]/actions");
    for (const headers of AGENT_REQUESTS) {
      setHeaders(headers);
      const form = new FormData();
      form.set("orderId", ORDER_ID);
      expect(await payAgainAction(null, form), JSON.stringify(headers)).toEqual({ error: "Platba kartou teď není dostupná." });
    }
    expect(state.dbTouched).toBe(false);
    expect(state.stripeTouched).toBe(false);
  });

  it("jiné domény beze změny: „Zaplatit znovu“ na Preview pokračuje k platbě", async () => {
    const { payAgainAction } = await import("@/app/eshop/objednavka/[id]/actions");
    setHeaders({ host: "mojebegina-git-claude-upbeat-goodall-pj64t5-jarin-max.vercel.app" });
    const form = new FormData();
    form.set("orderId", ORDER_ID);
    expect(await payAgainAction(null, form)).toEqual({ redirectTo: "https://checkout.stripe.test/x" });
    expect(state.dbTouched).toBe(true);
    expect(state.stripeTouched).toBe(true);
  });
});
