import { Info } from "lucide-react";

export default function PreviewBanner() {
  return (
    <div className="bg-begina-accent-100 text-begina-accent-900 text-xs sm:text-sm">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          <strong className="font-medium">Náhled e-shopu.</strong> Objednávky se zatím nikam
          neodesílají, údaje o produktech a ceny dopravy jsou k doplnění.
        </p>
      </div>
    </div>
  );
}
