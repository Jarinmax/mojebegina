import { describe, expect, it } from "vitest";
import { buildInfoMail, checkInfoMailAttachments, checkInfoMailRecipients } from "../email/infoMail";

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
    expect(mail.html).toContain('<p style="margin:0 0 12px">Dobrý den,</p><p style="margin:0 0 12px">děkujeme za platbu.</p>');
    expect(mail.html).toContain("<strong>Lucie Königsbergová</strong>");
    expect(mail.text).not.toContain("tým Begina");
  });

  it("podpis Jaroslava a týmu; HTML se escapuje", () => {
    expect(buildInfoMail("x", "jaroslav").text).toContain("Jaroslav Viner\nBegina\n+420 774 199 975");
    expect(buildInfoMail("x", "tym").text).toContain("tým Begina");
    expect(buildInfoMail("a <b> & c", "tym").html).toContain("a &lt;b&gt; &amp; c");
  });
});

describe("formátování e-mailu z info@ (Lucie 25. 11. 2026)", () => {
  const mail = buildInfoMail("Jarine,\n\n## Co spočítat\n- **Šťávy (l):** citronová\n- Koření\n\n**NEPOČÍTEJ:** kapsičky", "lucie");
  it("HTML: nadpis, odrážky, tučné", () => {
    expect(mail.html).toContain("font-weight:700\">Co spočítat</p>");
    expect(mail.html).toContain("<ul");
    expect(mail.html).toContain("<li style=\"margin:0 0 4px\"><strong>Šťávy (l):</strong> citronová</li>");
    expect(mail.html).toContain("<strong>NEPOČÍTEJ:</strong> kapsičky");
  });
  it("textová verze bez hvězdiček, s puntíky a nadpisem velkými", () => {
    expect(mail.text).toContain("CO SPOČÍTAT\n• Šťávy (l): citronová\n• Koření");
    expect(mail.text).not.toContain("**");
  });
  it("tučné i v odrážce se escapuje", () => {
    expect(buildInfoMail("- **a<b>**", "tym").html).toContain("<strong>a&lt;b&gt;</strong>");
  });
});

describe("checkInfoMailAttachments (přílohy z info@, 21. 11. 2026)", () => {
  const png = Buffer.from("fake-png-bytes").toString("base64");
  it("bez příloh je v pořádku", () => {
    expect(checkInfoMailAttachments(undefined)).toEqual({ ok: true, attachments: [] });
  });
  it("přijme obrázek a PDF", () => {
    const r = checkInfoMailAttachments([
      { filename: "foto.png", mime_type: "image/png", content_base64: png },
      { filename: "faktura.pdf", mime_type: "application/pdf", content_base64: png },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.attachments.map((a) => a.filename)).toEqual(["foto.png", "faktura.pdf"]);
  });
  it("odmítne zakázaný typ, chybný base64 i název s lomítkem", () => {
    expect(checkInfoMailAttachments([{ filename: "x.exe", mime_type: "application/x-msdownload", content_base64: png }]).ok).toBe(false);
    expect(checkInfoMailAttachments([{ filename: "a.png", mime_type: "image/png", content_base64: "%%%" }]).ok).toBe(false);
    expect(checkInfoMailAttachments([{ filename: "../a.png", mime_type: "image/png", content_base64: png }]).ok).toBe(false);
  });
  it("odmítne víc než 15 MB dohromady", () => {
    const big = "A".repeat(16 * 1024 * 1024 * (4 / 3));
    expect(checkInfoMailAttachments([{ filename: "big.pdf", mime_type: "application/pdf", content_base64: big }]).ok).toBe(false);
  });
});
