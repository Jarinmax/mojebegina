import { Check } from "lucide-react";

type PartnerProgramIntroProps = {
  headline: string;
  tagline: string;
  points: string[];
};

export default function PartnerProgramIntro({
  headline,
  tagline,
  points,
}: PartnerProgramIntroProps) {
  return (
    <div className="mb-4">
      <p className="text-lg font-medium text-begina-primary-900">{headline}</p>
      <p className="text-sm text-neutral-500 mb-3">{tagline}</p>
      <ul className="flex flex-col gap-1.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 text-begina-primary-700 mt-0.5 shrink-0" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
