import ShopLink from "./ShopLink";
import { FOOTER_LINKS, OPERATOR } from "@/lib/eshop/infoPages";

// Patička e-shopu: údaje provozovatele + odkazy na informační stránky
// (cíle a texty: lib/eshop/infoPages.ts).
export default function EshopFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-begina-primary-50">
      <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-neutral-600 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6">
        <address className="not-italic flex flex-col gap-0.5">
          <span className="font-medium text-begina-primary-900">Provozovatel</span>
          <span>{OPERATOR.name}</span>
          <a href={OPERATOR.phoneHref} className="hover:underline">
            {OPERATOR.phone}
          </a>
          <a href={`mailto:${OPERATOR.email}`} className="hover:underline">
            {OPERATOR.email}
          </a>
          <span>{OPERATOR.address}</span>
          <span>IČO: {OPERATOR.ico}</span>
        </address>
        <nav aria-label="Informace" className="sm:text-right">
          <ul className="flex flex-col">
            {FOOTER_LINKS.map((page) => (
              <li key={page.path}>
                <ShopLink href={page.path} className="block py-3 sm:inline-block sm:py-1.5 hover:underline underline-offset-2">
                  {page.footerLabel}
                </ShopLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
