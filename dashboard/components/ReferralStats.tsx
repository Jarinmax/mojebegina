type ReferralStatsProps = {
  invitedCount: number;
  purchasedCount: number;
};

export default function ReferralStats({ invitedCount, purchasedCount }: ReferralStatsProps) {
  const items = [
    { label: "Pozváno", value: String(invitedCount) },
    { label: "Nakoupilo", value: String(purchasedCount) },
    { label: "Odměny", value: "—" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-white border border-neutral-200 rounded-xl px-2.5 py-3 text-center"
        >
          <p className="text-base font-semibold text-begina-primary-800 leading-tight">
            {item.value}
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
