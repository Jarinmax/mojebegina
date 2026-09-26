import { describe, expect, it } from "vitest";
import { sanitizeReturnTo, DEFAULT_CRM_RETURN_TO } from "../returnTo";

// Security Phase 16.6 — regrese na nahlášený bug: "Zpět" z detailu leadu/
// zákazníka byl napevno na /rizeni-firmy/obchod (bez ?view=), takže se
// návrat ze "Všechny leady" vždy propadl na výchozí pohled "moje-leady".
// sanitizeReturnTo je jediné místo, které rozhoduje, kam "Zpět" skutečně
// vede — proto testováno zvlášť a důkladně, včetně anti-open-redirect
// hraničních případů (returnTo je nedůvěryhodný vstup z URL).
describe("sanitizeReturnTo — Security Phase 16.6", () => {
  it("platná URL na Obchod/CRM s view se propustí beze změny", () => {
    expect(sanitizeReturnTo("/rizeni-firmy/obchod?view=vsechny-leady")).toBe(
      "/rizeni-firmy/obchod?view=vsechny-leady"
    );
  });

  it("holé /rizeni-firmy/obchod (bez query) se propustí beze změny", () => {
    expect(sanitizeReturnTo("/rizeni-firmy/obchod")).toBe("/rizeni-firmy/obchod");
  });

  it("chybějící hodnota spadne na bezpečný výchozí návrat (Všechny leady)", () => {
    expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_CRM_RETURN_TO);
    expect(DEFAULT_CRM_RETURN_TO).toBe("/rizeni-firmy/obchod?view=vsechny-leady");
  });

  it("prázdný řetězec spadne na výchozí návrat", () => {
    expect(sanitizeReturnTo("")).toBe(DEFAULT_CRM_RETURN_TO);
  });

  it("pole hodnot (Next.js searchParams) použije první prvek", () => {
    expect(sanitizeReturnTo(["/rizeni-firmy/obchod?view=moje-leady", "cokoliv"])).toBe(
      "/rizeni-firmy/obchod?view=moje-leady"
    );
  });

  it("absolutní externí URL (open redirect) se odmítne", () => {
    expect(sanitizeReturnTo("https://evil.example.com")).toBe(DEFAULT_CRM_RETURN_TO);
    expect(sanitizeReturnTo("http://evil.example.com/rizeni-firmy/obchod")).toBe(DEFAULT_CRM_RETURN_TO);
  });

  it("protocol-relative URL (//evil.com) se odmítne", () => {
    expect(sanitizeReturnTo("//evil.example.com")).toBe(DEFAULT_CRM_RETURN_TO);
  });

  it("cesta mimo CRM sekci se odmítne", () => {
    expect(sanitizeReturnTo("/admin")).toBe(DEFAULT_CRM_RETURN_TO);
    expect(sanitizeReturnTo("/login")).toBe(DEFAULT_CRM_RETURN_TO);
  });

  it("podcesta uvnitř /rizeni-firmy/obchod (např. detail leadu) se odmítne — returnTo smí vést jen na seznam", () => {
    expect(sanitizeReturnTo("/rizeni-firmy/obchod/leady/123")).toBe(DEFAULT_CRM_RETURN_TO);
  });

  it("prefix trik (/rizeni-firmy/obchodXYZ) se odmítne", () => {
    expect(sanitizeReturnTo("/rizeni-firmy/obchodXYZ")).toBe(DEFAULT_CRM_RETURN_TO);
  });

  it("javascript: schéma se odmítne", () => {
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe(DEFAULT_CRM_RETURN_TO);
  });
});
