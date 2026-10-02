import { Info } from "lucide-react";
import type { StoreMode } from "@/lib/eshop/storeMode";

/** Pruh „Náhled e-shopu“ — v ostrém provozu (mode "live") se nezobrazuje. */
export default function PreviewBanner({ mode }: { mode: StoreMode }) {
  if (mode === "live") return null;
  return (
    <div className="bg-begina-accent-100 text-begina-accent-900 text-xs sm:text-sm">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          <strong className="font-medium">Náhled e-shopu.</strong>{" "}
          {mode === "test"
            ? "Testovací provoz: objednávky se ukládají do Moje Begina, platby jsou testovací a e-maily chodí jen na testovací adresy."
            : "Objednávky se zatím nikam neodesílají."}{" "}
          Údaje o produktech a ceny dopravy jsou k doplnění.
        </p>
      </div>
    </div>
  );
}
