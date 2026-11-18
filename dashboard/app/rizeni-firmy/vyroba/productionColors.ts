// Barvy skupin ve výrobě — jako v tabulce „Objednávky výroba Jarda“.
// Celé názvy tříd (Tailwind je musí najít ve zdrojáku).
export const GROUP_STYLE: Record<string, { band: string; row: string; label: string }> = {
  polevky: { band: "bg-amber-300", row: "bg-amber-50", label: "Polévky" },
  sirupy: { band: "bg-orange-300", row: "bg-orange-50", label: "Sirupy" },
  caje: { band: "bg-lime-300", row: "bg-lime-50", label: "Čaje" },
  "ovocne-napoje": { band: "bg-sky-300", row: "bg-sky-50", label: "Ovocné nápoje" },
  koktejly: { band: "bg-violet-300", row: "bg-violet-50", label: "Alkoholické koktejly" },
  zmrzliny: { band: "bg-yellow-200", row: "bg-yellow-50", label: "Zmrzliny" },
  ostatni: { band: "bg-rose-200", row: "bg-rose-50", label: "Ostatní" },
};
