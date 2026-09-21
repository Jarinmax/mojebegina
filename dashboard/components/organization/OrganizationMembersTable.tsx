import type { ReactNode } from "react";
import { formatCzechDate } from "@/lib/format";

// Security Phase 7 (Executive 1.0) — čistě prezentační tabulka členů,
// vytažená z app/admin/organizace/[id]/page.tsx. `renderActions` je
// volitelný — když ho volající stránka nepředá (app/executive/...), sloupec
// Akce se vůbec nevykreslí. Tohle je jediný mechanismus, kterým se admin a
// executive detail liší: executive žádné akce nemá, protože je nikdy
// nedostane předané, ne proto, že by se schovávaly nějakým css/if trikem.
// Security Phase 11 — stav pozvání/aktivace (lib/data/admin.ts,
// OnboardingStatus) se zobrazuje i tady jako informativní sloupec, ne jen
// v akcích — jde o stejný "sdílené čtení mezi /admin a /executive" princip
// jako u zbytku téhle tabulky.
type OnboardingStatus = "not_invited" | "pending" | "active";

const ONBOARDING_LABELS: Record<OnboardingStatus, string> = {
  not_invited: "Nepozván",
  pending: "Čeká na aktivaci",
  active: "Aktivní",
};

type MemberRow = {
  userId: string;
  role: "owner" | "member";
  createdAt: Date;
  name: string | null;
  email: string | null;
  onboardingStatus: OnboardingStatus;
};

type Props = {
  members: MemberRow[];
  renderActions?: (member: MemberRow) => ReactNode;
};

export default function OrganizationMembersTable({ members, renderActions }: Props) {
  if (members.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
        Organizace zatím nemá žádného uživatele.
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <th className="px-4 py-3 font-medium">Jméno</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Stav</th>
            <th className="px-4 py-3 font-medium">Členem od</th>
            {renderActions && <th className="px-4 py-3 font-medium">Akce</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.userId} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3 text-begina-primary-900">{member.name ?? "—"}</td>
              <td className="px-4 py-3 text-neutral-600">{member.email ?? "—"}</td>
              <td className="px-4 py-3 text-begina-primary-900">
                {member.role === "owner" ? "Vlastník" : "Člen"}
              </td>
              <td className="px-4 py-3 text-neutral-500">
                {ONBOARDING_LABELS[member.onboardingStatus]}
              </td>
              <td className="px-4 py-3 text-neutral-500">{formatCzechDate(member.createdAt)}</td>
              {renderActions && <td className="px-4 py-3">{renderActions(member)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
