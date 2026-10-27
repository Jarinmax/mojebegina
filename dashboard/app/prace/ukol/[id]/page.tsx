import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkTask } from "@/lib/data/workTasks";
import { WORK_ASSIGNEES } from "@/lib/data/workTasksAuth";
import { workTaskTone } from "@/lib/data/workTasksValidation";
import TaskCard from "../../TaskCard";
import { fmtDateTime, fmtDay, historyText, PRIORITY_LABEL } from "../../workTaskLabels";
import EditTaskForm from "./EditTaskForm";
import CancelTaskPanel from "./CancelTaskPanel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { open: "Nesplněno", done: "Splněno", cancelled: "Zrušeno" };
const TONE_LABEL = { red: "Urgentní / po termínu", orange: "Blíží se termín", blue: "Běžný úkol", green: "Splněno", grey: "Zrušeno" } as const;

// Práce 1.1 — detail úkolu. Pracovník vidí jen svůj (jinak 404) a může ho
// splnit/vrátit; zadání, prioritu ani zrušení měnit nesmí (formuláře se mu
// nezobrazí a server je navíc odmítne).
export default async function WorkTaskDetailPage(props: PageProps<"/prace/ukol/[id]">) {
  const { id } = await props.params;
  const data = await getWorkTask(id);
  if (!data) notFound();
  const { isManager, today, task } = data;
  const tone = workTaskTone(task, today);
  const cancelled = task.status === "cancelled";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/prace" className="text-sm text-neutral-500">← Zpět na úkoly</Link>

      <TaskCard
        showAssignee
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          assigneeName: task.assigneeName,
          dueLabel: task.dueDate ? `termín ${fmtDay(task.dueDate)}` : null,
          urgent: task.priority === "urgent",
          done: task.status === "done",
          cancelled,
          doneLabel: task.doneAt
            ? `Splnil(a) ${task.doneByName ?? "—"} · ${fmtDateTime(task.doneAt)}`
            : task.cancelledAt
              ? `Zrušil(a) ${task.cancelledByName ?? "—"} · ${fmtDateTime(task.cancelledAt)}`
              : null,
          tone,
          toneLabel: TONE_LABEL[tone],
          history: [],
        }}
      />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dt className="text-neutral-500">Stav</dt>
        <dd className="text-begina-primary-900">{STATUS_LABEL[task.status] ?? task.status}</dd>
        <dt className="text-neutral-500">Komu</dt>
        <dd className="text-begina-primary-900">{task.assigneeName}</dd>
        <dt className="text-neutral-500">Termín</dt>
        <dd className="text-begina-primary-900">{task.dueDate ? fmtDay(task.dueDate) : "—"}</dd>
        <dt className="text-neutral-500">Priorita</dt>
        <dd className="text-begina-primary-900">{PRIORITY_LABEL[task.priority] ?? task.priority}</dd>
      </dl>

      {isManager && !cancelled && (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <h2 className="text-sm font-medium text-begina-primary-900">Upravit zadání</h2>
          <EditTaskForm
            taskId={task.id}
            assignees={WORK_ASSIGNEES}
            initial={{ title: task.title, description: task.description, assigneeUserId: task.assigneeUserId, dueDate: task.dueDate, priority: task.priority }}
          />
        </section>
      )}

      {isManager && task.status === "open" && <CancelTaskPanel taskId={task.id} />}

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
