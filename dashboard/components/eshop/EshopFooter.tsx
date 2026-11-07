import ShopLink from "./ShopLink";
import { MapPin } from "lucide-react";
import { FOOTER_LINKS, OPERATOR } from "@/lib/eshop/infoPages";
import { PICKUP_PLACE } from "@/lib/eshop/operator";
import { WITHDRAWAL_PAGE_PATH } from "@/lib/eshop/content/withdrawalForm";

// Patička e-shopu: provozovatel (sídlo, fakturace) a provozovna (osobní
// odběr) jako dva oddělené bloky (zadání Lucie, 6. 11. 2026) + odkazy na informační stránky
// (cíle a texty: lib/eshop/infoPages.ts).
// cookieSettings = cookie lišta zapnutá: tlačítko otevře nastavení CookieYes
// (třída cky-banner-element) — souhlas jde kdykoli změnit nebo odvolat.
export default function EshopFooter({ cookieSettings = false }: { cookieSettings?: boolean }) {
  return (
    <footer className="border-t border-neutral-200 bg-begina-primary-50 print:hidden">
      <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-neutral-600 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          <section aria-labelledby="paticka-provozovatel">
            <h2 id="paticka-provozovatel" className="font-medium text-begina-primary-900 mb-1.5">
              Provozovatel a fakturační údaje
            </h2>
            <address className="not-italic flex flex-col gap-0.5">
              <span>{OPERATOR.name}</span>
              <span>{OPERATOR.address}</span>
              <span>IČO: {OPERATOR.ico}</span>
              <a href={OPERATOR.phoneHref} className="hover:underline w-fit">
                {OPERATOR.phone}
              </a>
              <a href={`mailto:${OPERATOR.email}`} className="hover:underline w-fit">
                {OPERATOR.email}
              </a>
            </address>
            <p className="mt-2 text-xs text-neutral-500">
              Sídlo a fakturační adresa. Osobní odběr probíhá v provozovně ve Viticích.
            </p>
          </section>
          <section aria-labelledby="paticka-provozovna" className="border-t border-neutral-200 pt-6 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-8">
            <h2 id="paticka-provozovna" className="font-medium text-begina-primary-900 mb-1.5">
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
              className="mt-2 inline-flex items-center gap-1 font-medium text-begina-primary-900 underline underline-offset-2"
            >
              <MapPin aria-hidden="true" className="w-4 h-4" />
              Zobrazit na mapě
            </a>
          </section>
        </div>
        <nav aria-label="Informace" className="md:text-right border-t border-neutral-200 pt-4 md:border-t-0 md:pt-0">
          <ul className="flex flex-col">
            {FOOTER_LINKS.map((page) => (
              <li key={page.path}>
                <ShopLink href={page.path} className="block py-3 md:inline-block md:py-1.5 hover:underline underline-offset-2">
                  {page.footerLabel}
                </ShopLink>
              </li>
            ))}
            <li>
              <ShopLink href={WITHDRAWAL_PAGE_PATH} className="block py-3 md:inline-block md:py-1.5 hover:underline underline-offset-2">
                Odstoupit od smlouvy
              </ShopLink>
            </li>
            {cookieSettings && (
              <li>
                <button
                  type="button"
                  className="cky-banner-element block py-3 md:inline-block md:py-1.5 hover:underline underline-offset-2"
                >
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
