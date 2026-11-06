import type { Metadata } from "next";
import { Download, Mail } from "lucide-react";
import EshopFileLink from "@/components/eshop/EshopFileLink";
import PrintButton from "@/components/eshop/PrintButton";
import ShopLink from "@/components/eshop/ShopLink";
import { linkify } from "@/components/eshop/InfoPageView";
import { CURRENT_TERMS } from "@/lib/eshop/content/termsVersions";
import {
  WITHDRAWAL_ADDRESSEE,
  WITHDRAWAL_FIELDS,
  WITHDRAWAL_FORM_DOWNLOAD_LABEL,
  WITHDRAWAL_FORM_NOTES,
  WITHDRAWAL_FORM_PDF_PATH,
  WITHDRAWAL_FORM_TITLE,
} from "@/lib/eshop/content/withdrawalForm";
import { DELIVERY_ADDRESS, OPERATOR } from "@/lib/eshop/operator";

// Odstoupení od smlouvy (zadání Lucie, 6. 11. 2026): jak odstoupit, vzorový
// formulář k tisku a ke stažení (PDF) a e-mail s předvyplněnou osnovou.
// Formulář = příloha platného znění obchodních podmínek (withdrawalForm.ts).
// Online funkce pro odstoupení (zákon č. 159/2026 Sb., od 1. 1. 2027) to
// není — jen e-mail, dopis nebo osobní předání.

export const metadata: Metadata = {
  title: "Odstoupení od smlouvy",
  description: "Jak odstoupit od kupní smlouvy v e-shopu Begina.cz — vzorový formulář k tisku a ke stažení.",
  alternates: { canonical: "/odstoupeni-od-smlouvy" },
};

const MAIL_SUBJECT = "Odstoupení od smlouvy";
const MAIL_BODY = [
  "Dobrý den,",
  "",
  "oznamuji, že tímto odstupuji od smlouvy o nákupu tohoto zboží:",
  "",
  "Číslo objednávky (nepovinné):",
  "Datum objednání:",
  "Datum obdržení (převzetí) zboží:",
  "Jméno a příjmení:",
  "Adresa:",
  "",
].join("\n");
const MAILTO = `mailto:${OPERATOR.email}?subject=${encodeURIComponent(MAIL_SUBJECT)}&body=${encodeURIComponent(MAIL_BODY)}`;

/** Řádky pro vyplnění v tištěné podobě (u výčtu zboží a adresy víc). */
function fillLines(field: string): number {
  if (field.startsWith("Oznamuji")) return 4;
  if (field.startsWith("Adresa")) return 2;
  return 1;
}

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 h-11 text-sm font-medium border border-begina-primary-900";

export default function WithdrawalPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      {/* Tisk: jen formulář — záhlaví, patička a návod se netisknou. */}
      <style>{"@media print{[data-print-hide]{display:none!important}@page{margin:14mm}}"}</style>

      <div data-print-hide>
        <h1 className="text-2xl font-semibold tracking-tight">Odstoupení od smlouvy</h1>
        <div className="mt-4 flex flex-col gap-3 text-neutral-700 leading-relaxed">
          <p>
            Jako spotřebitel můžete od kupní smlouvy odstoupit bez udání důvodu do 14 dnů od převzetí zboží. Výjimky
            (například zboží podléhající rychlé zkáze nebo otevřené balení) a podrobnosti jsou v{" "}
            <ShopLink href="/obchodni-podminky" className="underline underline-offset-2">
              obchodních podmínkách
            </ShopLink>{" "}
            v čl. VII. Vadné nebo poškozené zboží neodstupujte, ale reklamujte (čl. VIII) — reklamovat lze i zboží, na
            které se odstoupení nevztahuje.
          </p>
          <p className="font-medium text-begina-primary-900">Odstoupení nám můžete oznámit:</p>
          <ul className="flex flex-col gap-1.5 list-disc pl-5">
            <li>{linkify(`e-mailem na ${OPERATOR.email},`)}</li>
            <li>dopisem na doručovací adresu: {DELIVERY_ADDRESS.oneLine},</li>
            <li>osobně v provozovně na téže adrese.</li>
          </ul>
          <p>
            Použití vzorového formuláře není podmínkou odstoupení — stačí jakékoli jednoznačné prohlášení. Vracené zboží
            posílejte na doručovací adresu ve Viticích, ne na adresu sídla.
          </p>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <EshopFileLink
            href={WITHDRAWAL_FORM_PDF_PATH}
            className={`${buttonClass} bg-begina-primary-900 text-white hover:bg-begina-primary-800`}
          >
            <Download aria-hidden="true" className="w-4 h-4" />
            {WITHDRAWAL_FORM_DOWNLOAD_LABEL}
          </EshopFileLink>
          <PrintButton label="Vytisknout formulář" className={`${buttonClass} hover:bg-begina-primary-50`} />
          <a href={MAILTO} className={`${buttonClass} hover:bg-begina-primary-50`}>
            <Mail aria-hidden="true" className="w-4 h-4" />
            Napsat e-mail
          </a>
        </div>
      </div>

      <section
        aria-labelledby="formular"
        className="mt-8 border border-neutral-300 rounded-2xl p-5 sm:p-8 print:mt-0 print:border-0 print:p-0 text-[15px] text-neutral-800"
      >
        <h2 id="formular" className="text-lg font-semibold text-begina-primary-900">
          {WITHDRAWAL_FORM_TITLE}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Příloha obchodních podmínek e-shopu Begina.cz (znění účinné od {CURRENT_TERMS.effectiveLabel}). Vzor podle
          nařízení vlády č. 29/2023 Sb.
        </p>
        <p className="mt-4 text-sm italic">
          (vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)
        </p>
        <p className="mt-3 font-medium">Oznámení o odstoupení od smlouvy</p>
        <p className="mt-3">{WITHDRAWAL_ADDRESSEE}</p>
        <dl className="mt-4 flex flex-col gap-4">
          {WITHDRAWAL_FIELDS.map((field) => (
            <div key={field} className="break-inside-avoid">
              <dt>{field}</dt>
              <dd aria-hidden="true">
                {Array.from({ length: fillLines(field) }, (_, i) => (
                  <span key={i} className="block h-8 border-b border-dotted border-neutral-400" />
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-col gap-1.5 text-xs text-neutral-600">
          {WITHDRAWAL_FORM_NOTES.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>

      <p data-print-hide className="mt-8 text-sm text-neutral-500">
        Provozovatel: {OPERATOR.name}, sídlo a fakturační adresa {OPERATOR.address}, IČO {OPERATOR.ico}
      </p>
    </article>
  );
}
