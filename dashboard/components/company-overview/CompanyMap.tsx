import FlowSteps from "./FlowSteps";

// Security Phase 8 — vizuální schéma nahoře na stránce Řízení firmy.
// Čistě prezentační server komponenta (žádné klientské interakce nejsou
// potřeba), stejný princip jako zbytek stránky: obsah dostává jako props
// z lib/content/companyOverview.ts, nic si sám nenačítá.
type Props = {
  mapAreas: string[];
  mainFlow: string[];
  mapNotes: string[];
};

export default function CompanyMap({ mapAreas, mainFlow, mapNotes }: Props) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-5">
      <div className="flex flex-col items-center text-center mb-5">
        <div className="inline-block px-5 py-3 rounded-xl bg-begina-primary-900 text-begina-primary-50 text-sm font-semibold tracking-wide">
          MOJE.BEGINA.CZ
        </div>
        <p className="text-xs text-neutral-500 mt-2 max-w-sm">
          Centrum systému — data ze všech oblastí firmy se sbíhají tady.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-6">
        {mapAreas.map((area) => (
          <div
            key={area}
            className="border border-neutral-200 rounded-lg px-2 py-2 text-center text-xs font-medium text-begina-primary-900 bg-neutral-50"
          >
            {area}
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs text-neutral-500 mb-2">Hlavní obchodně-provozní tok</p>
        <FlowSteps steps={mainFlow} />
      </div>

      <ul className="mt-4 text-xs text-neutral-500 space-y-1 list-disc list-inside">
        {mapNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
