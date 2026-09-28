import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isCeoFocusAllowed } from "@/lib/data/ceoFocusAuth";
import { listFocusProjects } from "@/lib/data/ceoFocus";
import FocusProjectCard from "./FocusProjectCard";
import CreateFocusProjectForm from "./CreateFocusProjectForm";

export const dynamic = "force-dynamic";

// Security Phase 17 (CEO přehled 1.0) — osobní pracovní prostor,
// dostupný jen Jaroslavu Vinerovi a Jiřímu Střelcovi (viz ceoFocusAuth.ts),
// ne celému okruhu ADMIN/EXECUTIVE jako zbytek "Řízení firmy". Bez tohohle
// kontrolního redirectu by neschválený EXECUTIVE (dnes Blahout/
// Königsbergová) sice prošel nadřazeným layoutem, ale narazil by na
// neošetřenou ForbiddenError z datové vrstvy — tenhle redirect dává
// čistý fallback zpět na obecný přehled, který vidět smí.
export default async function CeoFocusPage() {
  const ctx = await getAuthContext();
  if (!isCeoFocusAllowed(ctx)) {
    redirect("/rizeni-firmy");
  }

  const projects = await listFocusProjects();

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">CEO přehled</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Hlavní projekty, priority a na čem se právě pracuje
          </p>
        </div>
        <CreateFocusProjectForm />
      </div>

      <div className="flex flex-col gap-2 mt-4">
        {projects.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            Zatím žádný projekt. Přidej první tlačítkem výše.
          </div>
        ) : (
          projects.map((project) => <FocusProjectCard key={project.id} project={project} />)
        )}
      </div>
    </div>
  );
}
