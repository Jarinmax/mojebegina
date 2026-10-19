// Sdílený rám zákaznické karty (pozadí, sloupec, spodní navigace). Používá
// ho skutečný zákaznický pohled (app/page.tsx, /objednavky, /profil)
// i interní náhled (app/nahled-zakaznika/[id]) — obě
// místa tak vždy ukazují totéž rozložení.
import DecorativeMark from "@/components/DecorativeMark";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";

export default function CustomerPortalShell({ activeHref, children }: { activeHref: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">{children}</div>
      <BottomNav items={bottomNavItems} activeHref={activeHref} />
    </div>
  );
}
