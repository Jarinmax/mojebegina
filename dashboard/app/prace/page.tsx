import Link from "next/link";
import { listWorkNotifications, listWorkTasks, type WorkTaskView } from "@/lib/data/workTasks";
import { getWorkerQueueView, type WorkerQueueView } from "@/lib/data/dailyCalls";
import { WORK_ASSIGNEES } from "@/lib/data/workTasksAuth";
import { pragueToday } from "@/lib/data/workTasksValidation";
import TaskCard from "./TaskCard";
import CreateTaskForm from "./CreateTaskForm";
import NotificationsPanel from "./NotificationsPanel";
import { toCard } from "./taskCardData";
import { fmtDay } from "./workTaskLabels";

export const dynamic = "force-dynamic";

async function loadCalls(): Promise<WorkerQueueView | null> {
  try {
    return await getWorkerQueueView();
  } catch {
    return null; // Denní volání nemusí být pro tohoto uživatele dostupné — obrazovka úkolů funguje dál
  }
}

function Section({ title, tasks, today, isManager, empty }: { title: string; tasks: WorkTaskView[]; today: string; isManager: boolean; empty?: string }) {
  if (tasks.length === 0 && !empty) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-begina-primary-900">
        {title} ({tasks.length})
      </h2>
      {tasks.length === 0 && <p className="text-sm text-neutral-500">{empty}</p>}
      {tasks.map((t) => (
        <TaskCard key={t.id} task={toCard(t, today, isManager)} showAssignee={isManager} />
      ))}
    </section>
  );
}

export default async function PracePage() {
  const [{ isManager, today, tasks, cancelled, photosEnabled }, calls, notifications] = await Promise.all([
    listWorkTasks(),
    loadCalls(),
    listWorkNotifications(),
  ]);
  const active = tasks.filter((t) => t.status === "open" || t.status === "returned");
  const waiting = tasks.filter((t) => t.status === "submitted");
  const done = tasks.filter((t) => t.status === "done");
  const doneToday = done.filter((t) => t.doneAt && pragueToday(t.doneAt) === today);
  const callItems = calls ? [...calls.carriedOver, ...calls.today] : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-medium text-begina-primary-900">{isManager ? "Práce týmu" : "Moje práce"}</h1>
        <p className="text-sm text-neutral-500">
          Dnes {fmtDay(today)} · {active.length} nesplněných · {waiting.length} čeká na schválení · {doneToday.length} splněno dnes
        </p>
      </div>

      <NotificationsPanel items={notifications} />

      {isManager && (
        <>
          <Section title="Ke kontrole" tasks={waiting} today={today} isManager={isManager} />
          <CreateTaskForm assignees={WORK_ASSIGNEES} today={today} photosEnabled={photosEnabled} />
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-begina-primary-900">
            {WORK_ASSIGNEES.map((a) => {
              const mine = tasks.filter((t) => t.assigneeUserId === a.userId);
              return (
                <p key={a.userId}>
                  <span className="font-medium">{a.name}:</span> {mine.filter((t) => t.status === "open" || t.status === "returned").length}{" "}
                  nesplněných, {mine.filter((t) => t.status === "submitted").length} ke kontrole,{" "}
                  {mine.filter((t) => doneToday.includes(t)).length} splněno dnes
                  {calls ? ` · Denní volání ${calls.doneToday}/${calls.totalToday}` : ""}
                </p>
              );
            })}
          </div>
        </>
      )}

      <Section title="Úkoly" tasks={active} today={today} isManager={isManager} empty="Žádné nesplněné úkoly." />

      {!isManager && <Section title="Čeká na schválení" tasks={waiting} today={today} isManager={isManager} />}

      {calls && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-begina-primary-900">
              Denní volání ({calls.doneToday}/{calls.totalToday} hotovo)
            </h2>
            <Link href="/rizeni-firmy/obchod/dnes" className="text-sm font-medium text-blue-700 underline">
              Zapsat výsledky
            </Link>
          </div>
          {callItems.length === 0 && <p className="text-sm text-neutral-500">Na dnešek nejsou žádné kontakty k volání.</p>}
          {callItems.map((c) => (
            <div key={c.id} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-begina-primary-900 min-w-0 truncate">{c.displayName}</span>
              {c.contactPhone && (
                <a href={`tel:${c.contactPhone.replace(/\s+/g, "")}`} className="shrink-0 text-sm font-medium text-blue-700">
                  {c.contactPhone}
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      <Section title="Splněno za posledních 7 dní" tasks={done} today={today} isManager={isManager} />

      {cancelled.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="text-sm font-medium text-neutral-500 cursor-pointer py-2">
            Zrušené úkoly za posledních 30 dní ({cancelled.length})
          </summary>
          <div className="flex flex-col gap-2 mt-2">
            {cancelled.map((t) => (
              <TaskCard key={t.id} task={toCard(t, today, isManager)} showAssignee={isManager} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
