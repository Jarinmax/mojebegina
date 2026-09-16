import type { ReactNode } from "react";

type ProfileSectionProps = {
  title: string;
  children: ReactNode;
};

export default function ProfileSection({ title, children }: ProfileSectionProps) {
  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-500 mb-2">{title}</p>
      <div className="bg-white border border-neutral-200 rounded-xl px-3.5">
        {children}
      </div>
    </div>
  );
}
