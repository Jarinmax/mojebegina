import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import CartLink from "@/components/eshop/CartLink";
import PreviewBanner from "@/components/eshop/PreviewBanner";

// E-shop 1.0 (náhled) — veřejná část bez přihlášení. Žádná stránka pod
// /eshop nevolá requireCustomerContext ani nečte session. Dokud jde
// o náhled, nesmí se indexovat.
export const metadata: Metadata = {
  title: {
    default: "E-shop Begina",
    template: "%s | E-shop Begina",
  },
  description: "Polévky Begina s doručením.",
  robots: { index: false, follow: false },
};

export default function EshopLayout({ children }: LayoutProps<"/eshop">) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-begina-primary-900">
      <PreviewBanner />
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/eshop" className="flex items-center gap-2.5" aria-label="Begina.cz — úvod">
            <Image src={logoMark} alt="" className="h-9 w-auto" priority />
            <span className="flex flex-col leading-tight">
              <span className="font-serif text-lg tracking-wide uppercase">Begina.cz</span>
              <span className="text-[11px] italic text-neutral-500">Když rozhoduje chuť</span>
            </span>
          </Link>
          <CartLink />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200 bg-begina-primary-50">
        <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-neutral-600 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6">
          {/* Údaje provozovatele převzaté ze stávající patičky begina.cz. */}
          <address className="not-italic flex flex-col gap-0.5">
            <span className="font-medium text-begina-primary-900">Provozovatel</span>
            <span>Jaroslav Viner</span>
            <a href="tel:+420774199975" className="hover:underline">+420 774 199 975</a>
            <a href="mailto:info@begina.cz" className="hover:underline">info@begina.cz</a>
            <span>Mostecká 273/21, 118 00 Praha 1</span>
            <span>IČO: 74337297</span>
          </address>
          <div className="flex flex-col gap-1 sm:text-right">
            <span>O nás</span>
            <span>Doprava</span>
            <span>Obchodní podmínky</span>
            <span>GDPR</span>
            <span className="text-xs text-neutral-400">(texty doplníme)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
