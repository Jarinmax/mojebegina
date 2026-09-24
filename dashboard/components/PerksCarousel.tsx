import Link from "next/link";

type Perk = {
  id: number | string;
  title: string;
  subtitle: string;
  href?: string;
};

type PerksCarouselProps = {
  perks: Perk[];
};

const CARD_CLASS =
  "rounded-xl p-3.5 bg-white border border-neutral-200 border-l-4 border-l-begina-accent-700";

export default function PerksCarousel({ perks }: PerksCarouselProps) {
  if (perks.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-500 mb-2">
        Aktuální výhody ({perks.length})
      </p>
      <div className="flex flex-col gap-2.5">
        {perks.map((perk) =>
          perk.href ? (
            <Link key={perk.id} href={perk.href} className={CARD_CLASS}>
              <p className="text-sm font-medium text-begina-primary-900 mb-1 break-words">
                {perk.title}
              </p>
              <p className="text-xs text-neutral-500 break-words">{perk.subtitle}</p>
            </Link>
          ) : (
            <div key={perk.id} className={CARD_CLASS}>
              <p className="text-sm font-medium text-begina-primary-900 mb-1 break-words">
                {perk.title}
              </p>
              <p className="text-xs text-neutral-500 break-words">{perk.subtitle}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
