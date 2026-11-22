import { describe, expect, it } from "vitest";
import { isSalesOnly, salesOnlyPathAllowed, SALES_ONLY_AGENT_TOOLS } from "../salesOnlyAuth";

describe("obchodník jen pro Obchod/CRM (22. 11. 2026)", () => {
  it("povolí jen /rizeni-firmy/obchod a podstránky", () => {
    expect(salesOnlyPathAllowed("/rizeni-firmy/obchod")).toBe(true);
    expect(salesOnlyPathAllowed("/rizeni-firmy/obchod/leady/abc")).toBe(true);
    expect(salesOnlyPathAllowed("/rizeni-firmy/obchodnik")).toBe(false);
    expect(salesOnlyPathAllowed("/rizeni-firmy/objednavky")).toBe(false);
    expect(salesOnlyPathAllowed("/rizeni-firmy")).toBe(false);
    expect(salesOnlyPathAllowed("")).toBe(false);
  });
  it("platí jen pro Blahouta", () => {
    expect(isSalesOnly(null)).toBe(false);
    expect(isSalesOnly({ userId: "06240ac4-c050-47ea-998c-6c81389edf9f" } as never)).toBe(true);
    expect(isSalesOnly({ userId: "f9f93f03-92b0-4724-becd-c0a3576b5275" } as never)).toBe(false);
  });
  it("v ChatGPT jen nástroje pro leady a zákazníky", () => {
    expect(SALES_ONLY_AGENT_TOOLS.has("get_lead")).toBe(true);
    expect(SALES_ONLY_AGENT_TOOLS.has("list_orders")).toBe(false);
    expect(SALES_ONLY_AGENT_TOOLS.has("economy_list_entries")).toBe(false);
  });
});
