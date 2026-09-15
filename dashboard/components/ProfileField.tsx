type ProfileFieldProps = {
  label: string;
  value: string;
};

export default function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <div className="py-3 border-b border-neutral-200 last:border-b-0">
      <p className="text-[11px] text-neutral-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-begina-primary-900">{value}</p>
    </div>
  );
}
