import ShopLink from "./ShopLink";
import { Mail, MapPin, Phone } from "lucide-react";
import { FOOTER_LINKS, OPERATOR } from "@/lib/eshop/infoPages";
import { PICKUP_PLACE } from "@/lib/eshop/operator";
import { WITHDRAWAL_PAGE_PATH } from "@/lib/eshop/content/withdrawalForm";

// Patička e-shopu (zadání majitele 9. 11. 2026): tři bloky v pořadí
// provozovna a osobní odběr → kontakt → provozovatel a fakturační údaje.
// Počítač: vedle sebe zleva doprava; mobil: pod sebou ve stejném pořadí.
// Telefon a e-mail jen v bloku Kontakt (klikací tel: / mailto:), ve
// fakturačních údajích se neopakují. Informační odkazy pod bloky, oddělené
// čarou (cíle a texty: lib/eshop/infoPages.ts).
// cookieSettings = cookie lišta zapnutá: tlačítko otevře nastavení CookieYes
// (třída cky-banner-element) — souhlas jde kdykoli změnit nebo odvolat.

export default function EshopFooter({ cookieSettings = false }: { cookieSettings?: boolean }) {
  const heading = "font-medium text-begina-primary-900 mb-1.5";
  const block = "border-t border-neutral-200 pt-6 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0 md:pl-8 md:border-l md:first:border-l-0 md:first:pl-0";
  const linkClass = "block py-3 sm:inline-block sm:py-1.5 hover:underline underline-offset-2";
  return (
    <footer className="border-t border-neutral-200 bg-begina-primary-50 print:hidden">
      <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-neutral-600">
        <div className="grid grid-cols-1 md:grid-cols-3">
          <section aria-labelledby="paticka-provozovna" className={block}>
            <h2 id="paticka-provozovna" className={heading}>
              Provozovna a osobní odběr
            </h2>
            <address className="not-italic flex flex-col gap-0.5">
              <span>{PICKUP_PLACE.name}</span>
              <span>({PICKUP_PLACE.area})</span>
              <span>{PICKUP_PLACE.address}</span>
            </address>
            <p className="mt-2 text-xs text-neutral-500">Zde najdete naše bistro a výdejní místo objednávek z e-shopu.</p>
            <a
              href={PICKUP_PLACE.mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 py-1 font-medium text-begina-primary-900 underline underline-offset-2"
            >
              <MapPin aria-hidden="true" className="w-4 h-4" />
              Zobrazit na mapě
            </a>
          </section>
          <section aria-labelledby="paticka-kontakt" className={block}>
            <h2 id="paticka-kontakt" className={heading}>
              Kontakt
            </h2>
            <ul className="flex flex-col gap-1">
              <li className="flex items-center gap-2">
                <Phone aria-hidden="true" className="w-4 h-4 shrink-0 text-begina-primary-700" strokeWidth={1.75} />
                <span>
                  Telefon:{" "}
                  <a href={OPERATOR.phoneHref} className="inline-block py-1 text-begina-primary-900 hover:underline underline-offset-2 whitespace-nowrap">
                    {OPERATOR.phone}
                  </a>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Mail aria-hidden="true" className="w-4 h-4 shrink-0 text-begina-primary-700" strokeWidth={1.75} />
                <span>
                  E-mail:{" "}
                  <a href={`mailto:${OPERATOR.email}`} className="inline-block py-1 text-begina-primary-900 hover:underline underline-offset-2">
                    {OPERATOR.email}
                  </a>
                </span>
              </li>
            </ul>
          </section>
          <section aria-labelledby="paticka-provozovatel" className={block}>
            <h2 id="paticka-provozovatel" className={heading}>
              Provozovatel a fakturační údaje
            </h2>
            <address className="not-italic flex flex-col gap-0.5">
              <span>{OPERATOR.name}</span>
              <span>{OPERATOR.address}</span>
              <span>IČO: {OPERATOR.ico}</span>
            </address>
            <p className="mt-2 text-xs text-neutral-500">
              Sídlo a fakturační adresa. Osobní odběr probíhá v provozovně ve Viticích.
            </p>
          </section>
        </div>
        <nav aria-label="Informace" className="mt-8 border-t border-neutral-200 pt-4">
          <ul className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-6">
            {FOOTER_LINKS.map((page) => (
              <li key={page.path}>
                <ShopLink href={page.path} className={linkClass}>
                  {page.footerLabel}
                </ShopLink>
              </li>
            ))}
            <li>
              <ShopLink href={WITHDRAWAL_PAGE_PATH} className={linkClass}>
                Odstoupit od smlouvy
              </ShopLink>
            </li>
            {cookieSettings && (
              <li>
                <button type="button" className={`cky-banner-element ${linkClass}`}>
                  Nastavení cookies
                </button>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
