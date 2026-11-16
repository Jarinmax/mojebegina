import { describe, expect, it } from "vitest";
import { buildInfoMail, checkInfoMailRecipients } from "../email/infoMail";

describe("e-mail z info@", () => {
  it("příjemci: platné adresy, bez duplicit, nejvýš pět", () => {
    expect(checkInfoMailRecipients(["Jan@Example.cz", " jan@example.cz "])).toEqual({ ok: true, to: ["jan@example.cz"] });
    expect(checkInfoMailRecipients([])).toMatchObject({ ok: false });
    expect(checkInfoMailRecipients(["neni-email"])).toMatchObject({ ok: false });
    expect(checkInfoMailRecipients(["a@b.cz, c@d.cz"])).toMatchObject({ ok: false });
    expect(checkInfoMailRecipients(["1@a.cz", "2@a.cz", "3@a.cz", "4@a.cz", "5@a.cz", "6@a.cz"])).toMatchObject({ ok: false });
  });

  it("podpis Lucie: jméno a její telefon, ne tým Begina", () => {
    const mail = buildInfoMail("Dobrý den,\n\nděkujeme za platbu.", "lucie");
    expect(mail.text).toBe("Dobrý den,\n\nděkujeme za platbu.\n\nS přátelským pozdravem\nLucie Königsbergová\nBegina\n+420 604 168 146\ninfo@begina.cz\nwww.begina.cz");
    expect(mail.html).toContain("<p>Dobrý den,</p><p>děkujeme za platbu.</p>");
    expect(mail.html).toContain("<strong>Lucie Königsbergová</strong>");
    expect(mail.text).not.toContain("tým Begina");
  });

  it("podpis Jaroslava a týmu; HTML se escapuje", () => {
    expect(buildInfoMail("x", "jaroslav").text).toContain("Jaroslav Viner\nBegina\n+420 774 199 975");
    expect(buildInfoMail("x", "tym").text).toContain("tým Begina");
    expect(buildInfoMail("a <b> & c", "tym").html).toContain("a &lt;b&gt; &amp; c");
  });
});
