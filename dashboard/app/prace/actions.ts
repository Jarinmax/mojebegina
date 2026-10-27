"use server";

// Práce 1.0 — "use server" hranice; oprávnění ověřuje datová vrstva
// (lib/data/workTasks.ts) sama, nezávisle na tom, co pošle klient.
import { revalidatePath } from "next/cache";
import { createWorkTask, setWorkTaskDone } from "@/lib/data/workTasks";

export type PraceActionState = { error: string } | { success: string } | null;

export async function createWorkTaskAction(_prev: PraceActionState, formData: FormData): Promise<PraceActionState> {
  try {
    const result = await createWorkTask({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      assigneeUserId: String(formData.get("assigneeUserId") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
      priority: String(formData.get("priority") ?? ""),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/prace");
    return { success: "Úkol byl zadán." };
  } catch (error) {
    console.error("createWorkTaskAction", error);
    return { error: "Úkol se nepodařilo uložit. Zkuste to prosím znovu." };
  }
}

export async function setWorkTaskDoneAction(taskId: string, done: boolean, _prev: PraceActionState, _formData: FormData): Promise<PraceActionState> {
  void _prev;
  void _formData;
  try {
    const result = await setWorkTaskDone(taskId, done);
    if (!result.ok) return { error: result.error };
    revalidatePath("/prace");
    return { success: done ? "Splněno." : "Vráceno mezi nesplněné." };
  } catch (error) {
    console.error("setWorkTaskDoneAction", error);
    return { error: "Změnu se nepodařilo uložit. Zkuste to prosím znovu." };
  }
}
