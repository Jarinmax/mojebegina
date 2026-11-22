// Časté otázky (20. 11. 2026): otázky ze zadání, odpovědi bez zdravotních tvrzení,
// údaje shodné s webem, FAQPage a Organization/LocalBusiness ve strukturovaných datech.
import { describe, expect, it } from "vitest";
import { FAQ_ITEMS, FAQ_PAGE, FAQ_PATH } from "../faq";
import { faqJsonLd, organizationJsonLd } from "../seo";
import { FOOTER_LINKS } from "../infoPages";
import { SLOVAKIA_DELIVERY_ALLOWED } from "../shipping";

describe("Časté otázky", () => {
  it("obsahuje otázky ze zadání", () => {
    const qs = FAQ_ITEMS.map((i) => i.question);
    for (const q of [
      "Kde si můžeme objednat hotové polévky a nápoje do kavárny?",
      "Jak posíláte objednávky po České republice?",
      "Jak dlouho vydrží polévka po otevření?",
      "Jsou vaše polévky veganské?",
      "Kolik stojí porce polévky?",
      "Můžu si objednat i domů?",
      "Jak ochutnat polévky a sirupy do provozu?",
    ]) expect(qs).toContain(q);
  });

  it("údaje jako na webu, bez zdravotních tvrzení a bez „zdarma“", () => {
    const all = FAQ_ITEMS.map((i) => i.answer).join(" ");
    expect(all).toContain("14 dní");
    expect(all).toContain("31,58 Kč");
    expect(all).toContain("379 Kč");
    expect(all).toContain("3 až 7 %");
    expect(all).not.toMatch(/zdrav|imunit|detox|vitamín|léčí/i);
  });

  it("stránka v patičce, FAQPage ze stejných textů", () => {
    expect(FAQ_PAGE.path).toBe(FAQ_PATH);
    expect(FOOTER_LINKS).toContain(FAQ_PAGE);
    const ld = faqJsonLd(FAQ_ITEMS);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQ_ITEMS.length);
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe(FAQ_ITEMS[0].answer);
  });

  it("Organization a LocalBusiness: telefon, e-mail, Vitice 119, doručení ČR (Slovensko jen při zapnutém doručení)", () => {
    const [org, local] = organizationJsonLd() as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(org).toMatchObject({ "@type": "Organization", telephone: "+420 774 199 975", email: "info@begina.cz" });
    expect(local).toMatchObject({ "@type": "LocalBusiness", address: { streetAddress: "Vitice 119", postalCode: "281 06" } });
    expect(JSON.stringify(local.areaServed)).toContain("Česká republika");
    expect(JSON.stringify(local.areaServed).includes("Slovensko")).toBe(SLOVAKIA_DELIVERY_ALLOWED);
    expect(FAQ_ITEMS.map((i) => i.answer).join(" ").includes("Slovensko")).toBe(SLOVAKIA_DELIVERY_ALLOWED);
  });
});
