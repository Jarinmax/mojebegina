import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isCeoFocusAllowed } from "@/lib/data/ceoFocusAuth";
import { getFocusProjectDetail, listCeoFocusStaffOptions } from "@/lib/data/ceoFocus";
import { setActiveFocusProjectAction, clearActiveFocusProjectAction } from "../actions";
import StatusBadge from "@/components/company-overview/StatusBadge";
import { PRIORITY_LABELS } from "../focusLabels";
import FocusUpdateForm from "./FocusUpdateForm";
import FocusOwnerForm from "./FocusOwnerForm";
import FocusActivityTimeline from "./FocusActivityTimeline";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Security Phase 17 (CEO přehled 1.0) — detail projektu. Účel podle
// zadání: "okamžitě obnovit kontext bez hledání ve starých chatech" —
// proto je aktuální popis/další krok/blocker hned nahoře a celá historie
// aktivit dole, stejné rozvržení jako u detailu leadu (Security Phase 16.3).
export default async function FocusProjectDetailPage(
  props: PageProps<"/rizeni-firmy/ceo/[id]">
) {
  const ctx = await getAuthContext();
  if (!isCeoFocusAllowed(ctx)) {
    redirect("/rizeni-firmy");
  }

  const { id } = await props.params;
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getFocusProjectDetail(id);
  if (!detail) {
    notFound();
  }
  const { project, activity } = detail;
  const staff = await listCeoFocusStaffOptions();

  return (
    <div>
      <Link href="/rizeni-firmy/ceo" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← CEO přehled
      </Link>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mt-2 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-lg font-medium text-begina-primary-900">{project.title}</h1>
          <StatusBadge status={project.status} />
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-2">
          {project.isActiveNow ? (
            <span className="inline-flex items-center text-xs font-medium bg-begina-primary-900 text-begina-primary-50 rounded-full px-2 py-0.5">
              Aktivní projekt TEĎ
            </span>
          ) : (
            <span className="text-xs text-neutral-400">{PRIORITY_LABELS[project.priority]}</span>
          )}
        </div>

        <form action={(project.isActiveNow ? clearActiveFocusProjectAction : setActiveFocusProjectAction).bind(null, project.id)}>
          <button
            type="submit"
            className="text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 hover:border-begina-primary-300"
          >
            {project.isActiveNow ? "Zrušit jako aktivní TEĎ" : "Nastavit jako aktivní projekt TEĎ"}
          </button>
        </form>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <FocusUpdateForm
          projectId={project.id}
          description={project.description}
          nextStep={project.nextStep}
          statusReason={project.status !== "green" ? project.statusReason : null}
        />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <FocusOwnerForm
          projectId={project.id}
          ownerUserId={project.ownerUserId}
          ownerName={project.ownerName}
          staff={staff}
        />
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivita</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <FocusActivityTimeline activity={activity} />
        </div>
      </div>
    </div>
  );
}
