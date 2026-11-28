import { describe, expect, it } from "vitest";
import { canResendConfirmation, confirmationEmail, normalizeEmail, parseSubscribeForm, segmentForVenue } from "../newsletter";
import { emailFromNewsletterToken, emailFromOptoutToken, newsletterToken } from "../reviews";
import { publicEshopPath } from "@/lib/site/routing";

describe("newsletter — souhlasy (28. 11. 2026)", () => {
  it("formulář: platný e-mail a segment, robot neprojde", () => {
    expect(parseSubscribeForm({ email: " Jana@Example.CZ ", segment: "domacnost", source: "web" })).toEqual({ ok: true, value: { email: "jana@example.cz", segment: "domacnost", source: "web" } });
    expect(parseSubscribeForm({ email: "x", segment: "domacnost", source: "web" })).toMatchObject({ ok: false });
    expect(parseSubscribeForm({ email: "a@b.cz", segment: "", source: "web" })).toMatchObject({ ok: false });
    expect(parseSubscribeForm({ email: "a@b.cz", segment: "kavarna", source: "cokoliv" })).toMatchObject({ ok: true, value: { source: "web" } });
    expect(parseSubscribeForm({ email: "a@b.cz", segment: "kavarna", source: "web", trap: "spam" })).toEqual({ ok: "bot" });
    expect(normalizeEmail("bez zavinace")).toBeNull();
  });

  it("segment z typu podniku", () => {
    expect(segmentForVenue("kavarna")).toBe("kavarna");
    expect(segmentForVenue("bistro")).toBe("kavarna");
    expect(segmentForVenue("jine")).toBeNull();
    expect(segmentForVenue(null)).toBeNull();
  });

  it("podepsaný odkaz potvrzení: nejde zaměnit s odhlášením a projde routingem", () => {
    const token = newsletterToken("Jana@Example.cz", "tajne");
    expect(emailFromNewsletterToken(token, "tajne")).toBe("jana@example.cz");
    expect(emailFromNewsletterToken(token, "jine")).toBeNull();
    expect(emailFromOptoutToken(token, "tajne")).toBeNull();
    expect(publicEshopPath(`/newsletter/${token}`)).toBe(`/eshop/newsletter/${token}`);
  });

  it("potvrzovací e-mail: tlačítko, odesílatel, test v předmětu; znovu nejdřív po 10 minutách", () => {
    const mail = confirmationEmail({ segment: "kavarna", source: "crm", confirmUrl: "https://begina.cz/newsletter/x.y", test: true });
    expect(mail.subject).toBe("[TEST] Potvrďte prosím odběr novinek Begina");
    expect(mail.html).toContain("https://begina.cz/newsletter/x.y");
    expect(mail.text).toContain("IČO 74337297");
    expect(mail.text).toContain("děkujeme za telefonát");
    const now = new Date("2026-11-28T12:00:00Z");
    expect(canResendConfirmation(null, now)).toBe(true);
    expect(canResendConfirmation(new Date("2026-11-28T11:55:00Z"), now)).toBe(false);
    expect(canResendConfirmation(new Date("2026-11-28T11:49:00Z"), now)).toBe(true);
  });
});
