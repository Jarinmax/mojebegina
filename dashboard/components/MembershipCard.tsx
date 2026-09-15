type MembershipCardProps = {
  name: string;
  memberId: string;
  status: string;
};

export default function MembershipCard({
  name,
  memberId,
  status,
}: MembershipCardProps) {
  return (
    <div className="rounded-2xl p-4 mb-4 bg-begina-primary-800 text-begina-primary-50 shadow-sm">
      <p className="text-xs mb-1 opacity-80">Moje Begina · členská karta</p>
      <p className="text-xl font-medium mb-3">{name}</p>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[11px] opacity-70">Členské číslo</p>
          <p className="text-sm font-medium tracking-wide">{memberId}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] opacity-70">Status</p>
          <p className="text-sm font-medium">{status}</p>
        </div>
      </div>
    </div>
  );
}
