type Perk = {
  id: number;
  title: string;
  validUntil: string;
};

type PerksCarouselProps = {
  perks: Perk[];
};

export default function PerksCarousel({ perks }: PerksCarouselProps) {
  if (perks.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-500 mb-2">Aktuální výhody</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-3 px-3 snap-x snap-mandatory">
        {perks.map((perk) => (
          <div
            key={perk.id}
            className="min-w-[220px] snap-start rounded-xl p-3.5 bg-white border border-neutral-200 border-l-4 border-l-begina-accent-700"
          >
            <p className="text-sm font-medium text-begina-primary-900 mb-1">
              {perk.title}
            </p>
            <p className="text-xs text-neutral-500">platí do {perk.validUntil}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
