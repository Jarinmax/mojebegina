// E-mailové šablony pro obchodníky (Jarda Blahout 23. 11. 2026: „něco
// podobného jako SMS i pro e-mail“). Otevírají e-mail v telefonu obchodníka
// (mailto:), takže klient odpovídá přímo jemu. Text si může před odesláním
// upravit.
export type EmailTemplateKind = "po_hovoru" | "nedovolal";

export type EmailTemplate = { kind: EmailTemplateKind; label: string; subject: string; body: string };

const PRO_KAVARNY = "https://begina.cz/pro-kavarny";

function signature(salesName: string | null): string {
  return salesName ? `${salesName}\nBegina · begina.cz` : "Tým Begina\nbegina.cz";
}

export function emailTemplates(salesName: string | null): EmailTemplate[] {
  const sig = signature(salesName);
  return [
    {
      kind: "po_hovoru",
      label: "E-mail po hovoru",
      subject: "Begina – děkuji za hovor",
      body:
        "Dobrý den,\n\n" +
        "děkuji za dnešní příjemný hovor. Posílám slíbené informace o Begině – 100% rostlinné polévky a nápoje v balení 3 l s kohoutkem, které se v kavárnách a bistrech snadno podávají.\n\n" +
        `Nabídku pro kavárny a ceník najdete tady: ${PRO_KAVARNY}\n\n` +
        "Kdybyste chtěli ochutnávku nebo cokoli doplnit, stačí odpovědět na tento e-mail.\n\n" +
        `S pozdravem\n${sig}`,
    },
    {
      kind: "nedovolal",
      label: "E-mail – nedovolal/a jsem se",
      subject: "Begina – zkoušeli jsme vám volat",
      body:
        "Dobrý den,\n\n" +
        "zkoušeli jsme vám dnes volat kvůli ochutnávce našich polévek a sirupů do vašeho provozu. Kdy se vám hodí, abychom zavolali znovu?\n\n" +
        `Mezitím se můžete podívat na nabídku pro kavárny: ${PRO_KAVARNY}\n\n` +
        `Děkuji a přeji hezký den\n${sig}`,
    },
  ];
}

export function mailtoHref(to: string, t: Pick<EmailTemplate, "subject" | "body">): string {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
}
