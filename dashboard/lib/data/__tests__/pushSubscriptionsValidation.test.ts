import { describe, expect, it } from "vitest";
import { pushSubscriptionInputSchema, pushUnsubscribeInputSchema } from "../pushSubscriptionsValidation";

const VALID_SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

describe("pushSubscriptionInputSchema — Jarda, upozornění na naplánovaný hovor", () => {
  it("platný odběr z PushSubscription.toJSON() projde", () => {
    expect(pushSubscriptionInputSchema.safeParse(VALID_SUBSCRIPTION).success).toBe(true);
  });

  it("endpoint musí být URL, ne jen libovolný text", () => {
    const result = pushSubscriptionInputSchema.safeParse({ ...VALID_SUBSCRIPTION, endpoint: "neni-url" });
    expect(result.success).toBe(false);
  });

  it("chybějící keys.p256dh = DENY", () => {
    const result = pushSubscriptionInputSchema.safeParse({ endpoint: VALID_SUBSCRIPTION.endpoint, keys: { auth: "auth-value" } });
    expect(result.success).toBe(false);
  });

  it("prázdný keys.auth = DENY", () => {
    const result = pushSubscriptionInputSchema.safeParse({ ...VALID_SUBSCRIPTION, keys: { p256dh: "x", auth: "" } });
    expect(result.success).toBe(false);
  });

  it("zcela jiný tvar vstupu (např. z cizího požadavku) = DENY", () => {
    expect(pushSubscriptionInputSchema.safeParse({ foo: "bar" }).success).toBe(false);
    expect(pushSubscriptionInputSchema.safeParse(null).success).toBe(false);
    expect(pushSubscriptionInputSchema.safeParse("string").success).toBe(false);
  });
});

describe("pushUnsubscribeInputSchema", () => {
  it("platný endpoint projde", () => {
    expect(pushUnsubscribeInputSchema.safeParse({ endpoint: VALID_SUBSCRIPTION.endpoint }).success).toBe(true);
  });

  it("neplatný endpoint (ne-URL) = DENY", () => {
    expect(pushUnsubscribeInputSchema.safeParse({ endpoint: "x" }).success).toBe(false);
  });
});
