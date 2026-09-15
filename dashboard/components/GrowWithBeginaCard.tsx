type GrowWithBeginaCardProps = {
  headline: string;
  body: string;
  ctaLabel: string;
};

export default function GrowWithBeginaCard({
  headline,
  body,
  ctaLabel,
}: GrowWithBeginaCardProps) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3.5 mb-4">
      <p className="text-sm font-medium text-begina-primary-900 mb-1.5">
        {headline}
      </p>
      <p className="text-sm text-neutral-600 leading-relaxed mb-3">{body}</p>
      <button
        type="button"
        className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
