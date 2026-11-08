"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { formatSubmittedAt, statementLines } from "@/lib/eshop/withdrawal";
import { submitWithdrawal } from "@/lib/eshop/withdrawalSubmit";

export type WithdrawalState =
  | { status: "idle" }
  | { status: "error"; error: string; field?: string }
  | { status: "done"; lines: [string, string][]; submittedAt: string; email: string };

async function currentBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function submitWithdrawalAction(_prev: WithdrawalState, formData: FormData): Promise<WithdrawalState> {
  if (!isEshopPublic()) return { status: "error", error: "E-shop je teď nedostupný." };
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  // Past na roboty (skryté pole, člověk ho nevyplní) — tváří se jako úspěch, nic neodešle.
  if (field("web")) return { status: "done", lines: [], submittedAt: "", email: "" };

  const result = await submitWithdrawal(
    db,
    { name: field("name"), email: field("email"), contract: field("contract"), items: field("items"), note: field("note") },
    { baseUrl: await currentBaseUrl() }
  );
  if (!result.ok) return { status: "error", error: result.error, field: result.field };
  return {
    status: "done",
    lines: statementLines(result.statement),
    submittedAt: formatSubmittedAt(result.statement.submittedAt),
    email: result.statement.email,
  };
}
