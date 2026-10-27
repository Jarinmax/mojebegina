import Link from "next/link";
import { listWorkTasks, type WorkTaskView } from "@/lib/data/workTasks";
import { getWorkerQueueView, type WorkerQueueView } from "@/lib/data/dailyCalls";
import { WORK_ASSIGNEES } from "@/lib/data/workTasksAuth";
import { pragueToday, workTaskTone, type WorkTaskTone } from "@/lib/data/workTasksValidation";
import TaskCard, { type TaskCardData } from "./TaskCard";
import CreateTaskForm from "./CreateTaskForm";

export const dynamic = "force-dynamic";

const PRAGUE_TIME = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtDateTime = (d: Date) => PRAGUE_TIME.format(d);
const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
};
function shift(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  if (due === today) return "termín dnes";
  if (due === shift(today, 1)) return "termín zítra";
  if (due < today) return `termín byl ${fmtDay(due)}`;
  return `termín ${fmtDay(due)}`;
}

function toneLabel(tone: WorkTaskTone, t: WorkTaskView): string {
  if (tone === "green") return "Splněno";
  if (tone === "red") return t.priority === "urgent" ? "Urgentní" : "Po termínu";
  if (tone === "orange") return "Blíží se termín";
  return "Běžný úkol";
}

const KIND: Record<string, string> = { created: "zadáno", done: "splněno", reopened: "vráceno mezi nesplněné" };

function toCard(t: WorkTaskView, today: string): TaskCardData {
  const tone = workTaskTone(t, today);
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeName: t.assigneeName,
    dueLabel: dueLabel(t.dueDate, today),
    urgent: t.priority === "urgent",
    done: t.status === "done",
    doneLabel: t.doneAt ? `Splnil(a) ${t.doneByName ?? "—"} · ${fmtDateTime(t.doneAt)}` : null,
    tone,
    toneLabel: toneLabel(tone, t),
    history: t.history.map((h) => `${fmtDateTime(h.createdAt)} — ${KIND[h.kind] ?? h.kind} (${h.actorName ?? "—"})`),
  };
}

async function loadCalls(): Promise<WorkerQueueView | null> {
  try {
    return await getWorkerQueueView();
  } catch {
    return null; // Denní volání nemusí být pro tohoto uživatele dostupné — obrazovka úkolů funguje dál
  }
}

export default async function PracePage() {
  const [{ isManager, today, tasks }, calls] = await Promise.all([listWorkTasks(), loadCalls()]);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const doneToday = done.filter((t) => t.doneAt && pragueToday(t.doneAt) === today);
  const callItems = calls ? [...calls.carriedOver, ...calls.today] : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-medium text-begina-primary-900">{isManager ? "Práce týmu" : "Moje práce"}</h1>
        <p className="text-sm text-neutral-500">
          Dnes {fmtDay(today)} · {open.length} nesplněných · {doneToday.length} splněno dnes
        </p>
      </div>

      {isManager && (
        <>
          <CreateTaskForm assignees={WORK_ASSIGNEES} today={today} />
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-begina-primary-900">
            {WORK_ASSIGNEES.map((a) => {
              const mine = tasks.filter((t) => t.assigneeUserId === a.userId);
              return (
                <p key={a.userId}>
                  <span className="font-medium">{a.name}:</span> {mine.filter((t) => t.status === "open").length} nesplněných,{" "}
                  {mine.filter((t) => doneToday.includes(t)).length} splněno dnes
                  {calls ? ` · Denní volání ${calls.doneToday}/${calls.totalToday}` : ""}
                </p>
              );
            })}
          </div>
        </>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-begina-primary-900">Úkoly ({open.length})</h2>
        {open.length === 0 && <p className="text-sm text-neutral-500">Žádné nesplněné úkoly.</p>}
        {open.map((t) => (
          <TaskCard key={t.id} task={toCard(t, today)} showAssignee={isManager} />
        ))}
      </section>

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

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Splněno za posledních 7 dní ({done.length})</h2>
          {done.map((t) => (
            <TaskCard key={t.id} task={toCard(t, today)} showAssignee={isManager} />
          ))}
        </section>
      )}
    </div>
  );
}
