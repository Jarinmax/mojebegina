import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkTask, markWorkNotificationsRead } from "@/lib/data/workTasks";
import { WORK_ASSIGNEES } from "@/lib/data/workTasksAuth";
import { MAX_PHOTOS_PER_TASK } from "@/lib/data/workTasksValidation";
import TaskCard from "../../TaskCard";
import { toCard } from "../../taskCardData";
import { fmtDateTime, fmtDay, historyText, PHOTO_REQUIREMENT_LABEL, PRIORITY_LABEL } from "../../workTaskLabels";
import EditTaskForm from "./EditTaskForm";
import CancelTaskPanel from "./CancelTaskPanel";
import PhotoGallery from "./PhotoGallery";
import PhotoUploader from "./PhotoUploader";
import CompleteTaskButton from "./CompleteTaskButton";
import ReviewPanel from "./ReviewPanel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Nesplněno",
  submitted: "Čeká na schválení",
  returned: "Vráceno k opravě",
  done: "Splněno",
  cancelled: "Zrušeno",
};

// Práce 1.1/2.0 — detail úkolu. Pracovník vidí jen svůj (jinak 404): může
// přikládat fotky, dokončit / odeslat ke kontrole a splněný úkol (bez
// schválení) vrátit; zadání, prioritu ani zrušení měnit nesmí (formuláře se
// mu nezobrazí a server je navíc odmítne). Vedoucí navíc upravuje, ruší a
// kontroluje (schválit / vrátit k opravě).
export default async function WorkTaskDetailPage(props: PageProps<"/prace/ukol/[id]">) {
  const { id } = await props.params;
  const data = await getWorkTask(id);
  if (!data) notFound();
  const { isManager, isAssignee, today, task, photosEnabled } = data;
  // Otevření úkolu = přečtení jeho upozornění.
  await markWorkNotificationsRead(`/prace/ukol/${task.id}`);

  const workable = task.status === "open" || task.status === "returned";
  const canWork = workable && (isAssignee || isManager);
  const photosAllowed = task.photoRequirement !== "none";
  const missingRequiredPhoto = task.photoRequirement === "required" && task.photos.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/prace" className="text-sm text-neutral-500 min-h-8">← Zpět na úkoly</Link>

      <TaskCard showAssignee task={toCard(task, today, isManager, "detail")} />

      {task.status === "returned" && task.returnReason && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">Vráceno k opravě</p>
          <p className="text-sm text-red-800 whitespace-pre-wrap">{task.returnReason}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dt className="text-neutral-500">Stav</dt>
        <dd className="text-begina-primary-900">{STATUS_LABEL[task.status] ?? task.status}</dd>
        <dt className="text-neutral-500">Komu</dt>
        <dd className="text-begina-primary-900">{task.assigneeName}</dd>
        <dt className="text-neutral-500">Termín</dt>
        <dd className="text-begina-primary-900">{task.dueDate ? fmtDay(task.dueDate) : "—"}</dd>
        <dt className="text-neutral-500">Priorita</dt>
        <dd className="text-begina-primary-900">{PRIORITY_LABEL[task.priority] ?? task.priority}</dd>
        <dt className="text-neutral-500">Fotografie</dt>
        <dd className="text-begina-primary-900">{PHOTO_REQUIREMENT_LABEL[task.photoRequirement] ?? task.photoRequirement}</dd>
        <dt className="text-neutral-500">Schválení</dt>
        <dd className="text-begina-primary-900">{task.requiresApproval ? "vyžaduje" : "ne"}</dd>
      </dl>

      {isManager && task.status === "submitted" && <ReviewPanel taskId={task.id} />}

      {(photosAllowed || task.photos.length > 0) && (
        <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <h2 className="text-sm font-medium text-begina-primary-900">
            Fotografie ({task.photos.length}){task.photoRequirement === "required" ? " · povinná" : ""}
          </h2>
          <PhotoGallery
            taskId={task.id}
            photos={task.photos.map((p) => ({
              id: p.id,
              caption: `${p.uploadedByName ?? "—"} · ${fmtDateTime(p.uploadedAt)}`,
              removable: p.removable && workable,
            }))}
          />
          {canWork && photosAllowed && photosEnabled && (
            <PhotoUploader taskId={task.id} remaining={MAX_PHOTOS_PER_TASK - task.photos.length} />
          )}
          {canWork && photosAllowed && !photosEnabled && (
            <p className="text-sm text-orange-700">Ukládání fotografií zatím není nastavené.</p>
          )}
        </section>
      )}

      {canWork && (
        <CompleteTaskButton
          taskId={task.id}
          requiresApproval={task.requiresApproval}
          blockedReason={missingRequiredPhoto ? "Před dokončením přiložte alespoň jednu fotografii." : null}
        />
      )}

      {isManager && task.status !== "cancelled" && (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <h2 className="text-sm font-medium text-begina-primary-900">Upravit zadání</h2>
          <EditTaskForm
            taskId={task.id}
            assignees={WORK_ASSIGNEES}
            photosEnabled={photosEnabled}
            initial={{
              title: task.title,
              description: task.description,
              assigneeUserId: task.assigneeUserId,
              dueDate: task.dueDate,
              priority: task.priority,
              photoRequirement: task.photoRequirement,
              requiresApproval: task.requiresApproval,
            }}
          />
        </section>
      )}

      {isManager && (task.status === "open" || task.status === "returned" || task.status === "submitted") && (
        <CancelTaskPanel taskId={task.id} />
      )}

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-begina-primary-900">Historie</h2>
        <ul className="rounded-xl border border-neutral-200 bg-white px-4 py-3 space-y-1">
          {task.history.map((h, i) => (
            <li key={i} className="text-sm text-neutral-700">{historyText(h)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
