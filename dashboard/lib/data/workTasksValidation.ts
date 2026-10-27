// Práce 1.0 — čistá validace a barevné pravidlo (bez I/O, testovatelné).
export const WORK_TASK_PRIORITIES = ["normal", "urgent"] as const;
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number];

export type CreateWorkTaskInput = {
  title: string;
  description: string;
  assigneeUserId: string;
  dueDate: string;
  priority: string;
};

export type ValidatedWorkTask = {
  title: string;
  description: string | null;
  assigneeUserId: string;
  dueDate: string | null;
  priority: WorkTaskPriority;
};

export function validateCreateWorkTask(
  input: CreateWorkTaskInput,
  allowedAssignees: readonly string[]
): { ok: true; value: ValidatedWorkTask } | { ok: false; error: string } {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Zadejte název úkolu." };
  if (title.length > 200) return { ok: false, error: "Název je příliš dlouhý (max. 200 znaků)." };
  const description = input.description.trim() || null;
  if (description && description.length > 2000) return { ok: false, error: "Popis je příliš dlouhý (max. 2000 znaků)." };
  if (!allowedAssignees.includes(input.assigneeUserId)) return { ok: false, error: "Vyberte, komu úkol patří." };
  const dueRaw = input.dueDate.trim();
  let dueDate: string | null = null;
  if (dueRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueRaw);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (!d || d.toISOString().slice(0, 10) !== dueRaw) return { ok: false, error: "Neplatný termín." };
    dueDate = dueRaw;
  }
  const priority = input.priority.trim() || "normal";
  if (!WORK_TASK_PRIORITIES.includes(priority as WorkTaskPriority)) return { ok: false, error: "Neplatná priorita." };
  return { ok: true, value: { title, description, assigneeUserId: input.assigneeUserId, dueDate, priority: priority as WorkTaskPriority } };
}

/** Dnešní datum v Europe/Prague jako "YYYY-MM-DD". */
export function pragueToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(now);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Schválený barevný design:
//   červená  = urgentní, nebo po termínu
//   oranžová = blížící se termín (dnes nebo zítra)
//   modrá    = běžný úkol
//   zelená   = splněno
export type WorkTaskTone = "red" | "orange" | "blue" | "green";

export function workTaskTone(task: { status: string; priority: string; dueDate: string | null }, today: string): WorkTaskTone {
  if (task.status === "done") return "green";
  if (task.priority === "urgent") return "red";
  if (task.dueDate && task.dueDate < today) return "red";
  if (task.dueDate && task.dueDate <= addDays(today, 1)) return "orange";
  return "blue";
}

const TONE_ORDER: Record<WorkTaskTone, number> = { red: 0, orange: 1, blue: 2, green: 3 };

export function sortWorkTasks<T extends { status: string; priority: string; dueDate: string | null; createdAt: Date }>(
  tasks: readonly T[],
  today: string
): T[] {
  return [...tasks].sort((a, b) => {
    const t = TONE_ORDER[workTaskTone(a, today)] - TONE_ORDER[workTaskTone(b, today)];
    if (t !== 0) return t;
    const da = a.dueDate ?? "9999-12-31";
    const dbb = b.dueDate ?? "9999-12-31";
    if (da !== dbb) return da < dbb ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}
