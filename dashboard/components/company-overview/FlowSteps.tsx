// Security Phase 8 — sdílený vizuální krok procesu ("A → B → C"), použitý
// v mapě firmy i v jednotlivých kartách oblastí. Čistě prezentační, žádná
// data ani autorizace. flex-wrap zajišťuje responzivitu — na mobilu se
// kroky zalomí na víc řádků, šipky zůstávají mezi nimi.
type Props = {
  steps: string[];
};

export default function FlowSteps({ steps }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {steps.map((step, i) => (
        <div key={`${step}-${i}`} className="flex items-center gap-2">
          <span className="inline-block px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 text-xs font-medium whitespace-nowrap">
            {step}
          </span>
          {i < steps.length - 1 && (
            <span className="text-neutral-300 text-xs" aria-hidden="true">
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
