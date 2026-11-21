import { describe, expect, it } from "vitest";
import { classifySource, hasOptOutCookie, isTrackedStep, segmentSplit, sourceRows } from "../funnel";

describe("zdroje návštěv", () => {
  it("pozná AI asistenty", () => {
    expect(classifySource("", "?utm_source=chatgpt.com")).toBe("chatgpt");
    expect(classifySource("https://chatgpt.com/", "")).toBe("chatgpt");
    expect(classifySource("https://www.perplexity.ai/search?q=x", "")).toBe("perplexity");
    expect(classifySource("https://copilot.microsoft.com/", "")).toBe("copilot");
    expect(classifySource("https://gemini.google.com/app", "")).toBe("gemini");
    expect(classifySource("https://claude.ai/chat/1", "")).toBe("claude");
  });
  it("pozná vyhledávače, Meta a přímé návštěvy", () => {
    expect(classifySource("https://www.google.com/", "")).toBe("google");
    expect(classifySource("https://www.google.cz/", "")).toBe("google");
    expect(classifySource("https://www.google.cz/", "?srsltid=abc")).toBe("google_vypis");
    expect(classifySource("https://search.seznam.cz/?q=x", "")).toBe("seznam");
    expect(classifySource("https://www.bing.com/", "")).toBe("bing");
    expect(classifySource("https://l.facebook.com/", "")).toBe("meta");
    expect(classifySource("", "?fbclid=123")).toBe("meta");
    expect(classifySource("https://m.instagram.com/", "")).toBe("meta");
    expect(classifySource("https://nejakyblog.cz/clanek", "")).toBe("jiny_web");
    expect(classifySource("", "")).toBe("primo");
  });
  it("vlastní web není nová návštěva zvenku", () => {
    expect(classifySource("https://begina.cz/kosik", "")).toBeNull();
    expect(classifySource("https://moje.begina.cz/", "")).toBeNull();
    expect(classifySource("https://begina.cz/", "?utm_source=chatgpt.com")).toBe("chatgpt");
  });
  it("přijme jen známé kroky zdrojů", () => {
    expect(isTrackedStep("src_visit_chatgpt")).toBe(true);
    expect(isTrackedStep("src_order_meta")).toBe(true);
    expect(isTrackedStep("firma_checkout")).toBe(true);
    expect(isTrackedStep("src_visit_neco")).toBe(false);
  });
  it("cookie vyřazení z měření", () => {
    expect(hasOptOutCookie("a=1; begina_nemerit=1")).toBe(true);
    expect(hasOptOutCookie("begina_nemerit=1")).toBe(true);
    expect(hasOptOutCookie("begina_nemerit=0")).toBe(false);
    expect(hasOptOutCookie(null)).toBe(false);
  });
  it("souhrny zdrojů a kaváren", () => {
    const days = [
      { counts: { src_visit_chatgpt: 2, src_order_chatgpt: 1, src_visit_google: 5, order: 3, order_ico: 2, paid: 2, paid_ico: 1, firma_checkout: 4 } },
      { counts: { src_visit_google: 1 } },
    ];
    const rows = sourceRows(days);
    expect(rows.map((r) => [r.source, r.visits, r.orders])).toEqual([["google", 6, 0], ["chatgpt", 2, 1]]);
    expect(rows[1].isAi).toBe(true);
    expect(segmentSplit(days)).toEqual({ companyCheckout: 4, ordersCompany: 2, ordersHome: 1, paidCompany: 1, paidHome: 1 });
  });
});
