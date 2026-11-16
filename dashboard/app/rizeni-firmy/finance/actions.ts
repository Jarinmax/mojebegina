"use server";

// FINANCE – KONTROLY A AUDIT 1.0 — zápisy do auditního deníku. Jen Jaroslav
// a Lucie (isInvoiceIssuer). Deník je jen pro přidávání: nic se neupravuje
// ani nemaže, oprava omylu = nový zápis (poznámka).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { findCheck, findingStates, summarizeFindings, type CheckKey, type LogAction } from "@/lib/finance-kontroly/checks";
import { runIdokladCheck } from "@/lib/finance-kontroly/idoklad";
import { appendLog, financeLogTableExists, loadCheckLog, runDatabaseChecks } from "@/lib/finance-kontroly/server";
import { BASE, folderHref, parseYear, pragueToday } from "./shared";

const MAX_NOTE = 2000;
const MAX_SNAPSHOT_FINDINGS = 500;

async function requireOwner() {
  const ctx = await getAuthContext();
  return ctx && isInvoiceIssuer(ctx) ? ctx : null;
}

const text = (formData: FormData, name: string, max: number) => {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, max) : null;
};

function back(checkKey: string, year: number, params: Record<string, string> = {}): never {
  const query = new URLSearchParams({ rok: String(year), ...params });
  redirect(`${BASE}/${checkKey}?${query.toString()}`);
}

async function prepare(formData: FormData) {
  const ctx = await requireOwner();
  if (!ctx) redirect(BASE);
  const check = findCheck(String(formData.get("checkKey") ?? ""));
  if (!check) redirect(BASE);
  const year = parseYear(formData.get("rok"), pragueToday().year);
  if (!(await financeLogTableExists())) back(check.key, year, { chyba: "Deník kontrol v databázi ještě není (skript 123_finance_kontroly_MAIN)." });
  return { ctx, check, year };
}

/** Výsledek prověření nálezu (ok / fixed) nebo poznámka k nálezu či ke kontrole. */
export async function recordFindingAction(formData: FormData): Promise<void> {
  const { ctx, check, year } = await prepare(formData);
  const actionRaw = String(formData.get("action") ?? "");
  const action: LogAction | null = actionRaw === "ok" || actionRaw === "fixed" || actionRaw === "note" ? actionRaw : null;
  const findingKey = text(formData, "findingKey", 400);
  const note = text(formData, "note", MAX_NOTE);
  if (!action) back(check.key, year, { chyba: "Vyberte, co chcete zapsat." });
  if (action !== "note" && !findingKey) back(check.key, year, { chyba: "Chybí nález, ke kterému zápis patří." });
  if (action === "note" && !note) back(check.key, year, { chyba: "Poznámka je prázdná." });

  await appendLog({ checkKey: check.key, findingKey, action, note, createdByUserId: ctx.userId, authorName: ctx.name ?? ctx.email ?? null });
  revalidatePath(BASE, "layout");
  back(check.key, year, { ulozeno: "1" });
}

/** Zápis o provedení kontroly se snapshotem nálezů (kontroly nad daty MojeBegina). */
export async function recordRunAction(formData: FormData): Promise<void> {
  const { ctx, check, year } = await prepare(formData);
  if (check.onDemand) back(check.key, year, { chyba: "Tuhle kontrolu zapíše tlačítko „Spustit kontrolu“." });
  const { today } = pragueToday();
  const run = (await runDatabaseChecks(year, today)).find((item) => item.key === check.key);
  if (!run || !run.available) back(check.key, year, { chyba: run?.error ?? "Kontrolu se nepodařilo provést." });
  const log = await loadCheckLog(check.key);
  const summary = summarizeFindings(run.findings, findingStates(run.findings, log));
  await appendLog({
    checkKey: check.key,
    findingKey: null,
    action: "run",
    note: text(formData, "note", MAX_NOTE),
    snapshot: { year, checkedOn: today, summary, findings: run.findings.slice(0, MAX_SNAPSHOT_FINDINGS), truncated: run.findings.length > MAX_SNAPSHOT_FINDINGS },
    createdByUserId: ctx.userId,
    authorName: ctx.name ?? ctx.email ?? null,
  });
  revalidatePath(BASE, "layout");
  back(check.key, year, { ulozeno: "1" });
}

/** Spustí kontrolu iDokladu a výsledek uloží jako zápis o provedení. */
export async function runIdokladAction(formData: FormData): Promise<void> {
  const { ctx, check, year } = await prepare(formData);
  if (check.key !== ("idoklad" satisfies CheckKey)) redirect(folderHref(check.key, year));
  const { today } = pragueToday();
  const result = await runIdokladCheck(year, today);
  if (!result.ok) back(check.key, year, { chyba: result.error.slice(0, 300) });
  const log = await loadCheckLog(check.key);
  const summary = summarizeFindings(result.findings, findingStates(result.findings, log));
  await appendLog({
    checkKey: check.key,
    findingKey: null,
    action: "run",
    note: text(formData, "note", MAX_NOTE),
    snapshot: {
      year,
      checkedOn: today,
      summary,
      findings: result.findings.slice(0, MAX_SNAPSHOT_FINDINGS),
      truncated: result.truncated || result.findings.length > MAX_SNAPSHOT_FINDINGS,
      unpaidFrom: result.dateFrom,
      scanned: result.scanned,
    },
    createdByUserId: ctx.userId,
    authorName: ctx.name ?? ctx.email ?? null,
  });
  revalidatePath(BASE, "layout");
  back(check.key, year, { ulozeno: "1" });
}
