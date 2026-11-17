// Hvězdičky hodnocení (17. 11. 2026) — jen zobrazení; plná část podle průměru.
const STAR = "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";

export default function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (color: string) => (
    <span className="flex" style={{ color }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <svg key={index} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
  return (
    <span className="relative inline-block align-middle" role="img" aria-label={label ?? `${value} z 5 hvězdiček`}>
      {row("#D9D4C7")}
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${percent}%` }}>
        {row("#C8881A")}
      </span>
    </span>
  );
}
