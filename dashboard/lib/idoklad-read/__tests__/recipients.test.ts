import { describe, expect, it } from "vitest";
import { allowedExtraRecipients, checkInvoiceRecipients } from "../recipients";

const ctx = { partnerEmail: "fakturace@firma.example", userEmail: "lucie.konigsbergova@seznam.cz", extra: ["lucie.konigsbergova@gmail.com"] };

describe("příjemci PDF faktury z iDokladu", () => {
  it("povolí odběratele z faktury, @begina.cz, vlastní účet a adresy od správce", () => {
    expect(checkInvoiceRecipients(["Fakturace@Firma.example", "info@begina.cz", "lucie.konigsbergova@seznam.cz", "lucie.konigsbergova@gmail.com"], ctx)).toEqual({
      ok: true,
      to: ["fakturace@firma.example", "info@begina.cz", "lucie.konigsbergova@seznam.cz", "lucie.konigsbergova@gmail.com"],
      reasons: { "fakturace@firma.example": "customer", "info@begina.cz": "begina", "lucie.konigsbergova@seznam.cz": "own", "lucie.konigsbergova@gmail.com": "allowed" },
    });
  });

  it("cizí adresu odmítne celé odeslání (nic se nepošle ani povoleným)", () => {
    const r = checkInvoiceRecipients(["info@begina.cz", "utocnik@evil.example"], ctx);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/utocnik@evil.example.*Nic se neodeslalo/) });
    expect(checkInvoiceRecipients(["x@begina.cz.evil.example"], ctx)).toMatchObject({ ok: false });
  });

  it("bez e-mailu odběratele na faktuře ho nelze nahradit libovolnou adresou; limity a formát", () => {
    expect(checkInvoiceRecipients(["fakturace@firma.example"], { ...ctx, partnerEmail: null })).toMatchObject({ ok: false });
    expect(checkInvoiceRecipients([], ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/aspoň jednoho/) });
    expect(checkInvoiceRecipients(["a@begina.cz", "b@begina.cz", "c@begina.cz", "d@begina.cz", "e@begina.cz", "f@begina.cz"], ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/Nejvýš 5/) });
    expect(checkInvoiceRecipients(["neni-email"], ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/Neplatná adresa/) });
  });

  it("IDOKLAD_INVOICE_EMAIL_ALLOWED: čárky i mezery, malá písmena, neplatné vynechá", () => {
    expect(allowedExtraRecipients({ IDOKLAD_INVOICE_EMAIL_ALLOWED: " Lucie.Konigsbergova@gmail.com, spatne ;x@y.cz" })).toEqual(["lucie.konigsbergova@gmail.com", "x@y.cz"]);
    expect(allowedExtraRecipients({})).toEqual([]);
  });
});
