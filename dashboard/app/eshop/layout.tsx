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
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/eshop" className="flex items-center gap-2.5" aria-label="E-shop Begina — úvod">
            <Image src={logoMark} alt="" className="h-8 w-auto" priority />
            <span className="text-sm font-medium tracking-wide uppercase">E-shop</span>
          </Link>
          <CartLink />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200 bg-begina-primary-50">
        <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-neutral-500 flex flex-col sm:flex-row gap-2 sm:justify-between">
          <p>© Begina</p>
          <p>Obchodní podmínky · Reklamační řád · Ochrana osobních údajů (texty doplníme)</p>
        </div>
      </footer>
    </div>
  );
}
