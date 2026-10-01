import Link from "next/link";

// Security Phase 19.3 — celá bílá karta je klikací, ne jen text
// "Otevřít →" vedle ní (schváleno explicitně: "kliknutí kamkoli na kartu
// otevře CEO přehled"). Jeden <Link> obaluje popis i "Otevřít →"
// dohromady — NE dva vnořené odkazy (HTML nedovolí <a> uvnitř <a>, navíc
// by to rozbilo hydrataci). Protože je to skutečný <a> prvek (ne <div>
// s onClick), je přirozeně dostupný i klávesnicí (Tab + Enter) a dostává
// `cursor: pointer` automaticky — žádná extra práce navíc, jen jemná
// hover odezva (border + lehké podbarvení) jako vizuální potvrzení.
//
// Vytčeno jako samostatná komponenta (dřív inline v
// app/rizeni-firmy/page.tsx), aby šla nezávisle otestovat bez nutnosti
// mockovat celou asynchronní stránku (listCompanyNotes/getCompanyMap/
// listOrders/getCockpitCounts). Oprávnění (isCeoFocusAllowed) zůstává
// výhradně v page.tsx — tahle komponenta se vykreslí, jen když už
// stránka rozhodla, že se smí zobrazit.
export default function CeoFocusPanel() {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">CEO přehled</h2>
      <Link
        href="/rizeni-firmy/ceo"
        className="group flex items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl p-4 cursor-pointer transition-colors hover:border-begina-primary-300 hover:bg-begina-primary-50/50"
      >
        <span className="text-sm text-neutral-500">
          Hlavní projekty, priority a na čem se právě pracuje — osobní pracovní prostor.
        </span>
        <span className="text-sm font-medium text-begina-primary-900 whitespace-nowrap group-hover:underline">
          Otevřít →
        </span>
      </Link>
    </div>
  );
}
