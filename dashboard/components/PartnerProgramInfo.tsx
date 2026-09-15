type PartnerProgramInfoProps = {
  conditions: string[];
  shipping: string;
  legalNote: string;
};

export default function PartnerProgramInfo({
  conditions,
  shipping,
  legalNote,
}: PartnerProgramInfoProps) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3.5 mb-4">
      <p className="text-sm font-medium mb-2">Podmínky programu</p>
      <ul className="flex flex-col gap-1.5 mb-3">
        {conditions.map((condition) => (
          <li key={condition} className="flex items-start gap-2 text-sm text-neutral-600">
            <span className="w-1 h-1 rounded-full bg-neutral-400 mt-2 shrink-0" />
            <span>{condition}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm font-medium mb-1">Doprava</p>
      <p className="text-sm text-neutral-600 mb-3">{shipping}</p>

      <p className="text-xs text-neutral-400">{legalNote}</p>
    </div>
  );
}
