import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLeadDetail, findDuplicateOrganizations } from "@/lib/data/leads";
import { getAuthContext } from "@/lib/data/authContext";
import LinkOrganizationButton from "./LinkOrganizationButton";
import NewOrganizationForm from "./NewOrganizationForm";
import type { OrganizationMatch } from "@/lib/data/leads";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Security Phase 16 (Obchod/CRM 1.0) — konverze leadu na zákazníka.
// Detekce duplicit jen NAVRHUJE kandidáty (silná shoda IČO → možná shoda
// kontaktu → podobnost názvu jako kandidát k ruční kontrole) — nikdy nic
// nespojuje automaticky, finální propojení vždy potvrzuje člověk (schváleno
// explicitně). Založení NOVÉ organizace zůstává vyhrazené ADMINovi (stejné
// omezení jako v Begina Adminu) — EXECUTIVE tu vidí jen možnost propojit
// s existující organizací.
export default async function ConvertLeadPage(props: PageProps<"/rizeni-firmy/obchod/leady/[id]/prevest">) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getLeadDetail(id);
  if (!detail) {
    notFound();
  }
  if (detail.lead.stage === "converted" && detail.lead.convertedOrganizationId) {
    redirect(`/rizeni-firmy/obchod/zakaznici/${detail.lead.convertedOrganizationId}`);
  }

  const [candidates, ctx] = await Promise.all([findDuplicateOrganizations(id), getAuthContext()]);
  const isAdmin = ctx?.systemRole === "ADMIN";

  const groups: { title: string; hint: string; matches: OrganizationMatch[] }[] = [
    {
      title: "Silná shoda — stejné IČO",
      hint: "Velmi pravděpodobně stejná firma.",
      matches: candidates.icoMatches,
    },
    {
      title: "Možná shoda — telefon/e-mail",
      hint: "Stejný kontakt se objevil u dřívější objednávky.",
      matches: candidates.contactMatches,
    },
    {
      title: "Podobný název — zkontrolujte ručně",
      hint: "Jen podobnost textu, může jít o úplně jinou firmu.",
      matches: candidates.nameMatches,
    },
  ];
  const hasCandidates = groups.some((g) => g.matches.length > 0);

  return (
    <div>
      <Link
        href={`/rizeni-firmy/obchod/leady/${id}`}
        className="text-sm text-neutral-500 hover:text-begina-primary-900"
      >
        ← {detail.lead.displayName}
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Převést na zákazníka</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Nikdy se nic nespojí automaticky — vyber existující organizaci, nebo založ novou.
        </p>
      </div>

      {hasCandidates && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-begina-primary-900 mb-2">Možná už je to náš zákazník</p>
          {groups
            .filter((g) => g.matches.length > 0)
            .map((group) => (
              <div key={group.title} className="mb-3 last:mb-0">
                <p className="text-xs text-neutral-500 mb-1">{group.title}</p>
                <p className="text-xs text-neutral-400 mb-1">{group.hint}</p>
                {group.matches.map((org) => (
                  <LinkOrganizationButton key={org.id} leadId={id} organization={org} />
                ))}
              </div>
            ))}
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <p className="text-sm font-medium text-begina-primary-900 mb-1">
          {hasCandidates ? "Žádná shoda nesedí? Založit jako novou" : "Založit jako novou organizaci"}
        </p>
        {isAdmin ? (
          <div className="mt-3">
            <NewOrganizationForm
              leadId={id}
              defaultName={detail.lead.companyName ?? ""}
              defaultIco={detail.lead.ico ?? ""}
              defaultContactName={detail.lead.contactName ?? ""}
              defaultContactEmail={detail.lead.contactEmail ?? ""}
            />
          </div>
        ) : (
          <p className="text-sm text-neutral-500 mt-2">
            Založení nové organizace vyžaduje roli ADMIN. Požádej Jaroslava Vinera, ať organizaci založí —
            pak sem lead propojíš přes shodu výše, nebo tě může rovnou nastavit jako obchodníka.
          </p>
        )}
      </div>
    </div>
  );
}
