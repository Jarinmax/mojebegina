"use server";

// GPT/MCP pilot — odvolání vlastního souhlasu pro asistenta (ChatGPT, Claude). Odvolat jde jen
// vlastní grant (userId ze session je přímo v podmínce UPDATE).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { revokeOwnGrant } from "@/lib/agent/oauthStore";

export async function revokeAgentGrantAction(grantId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  await revokeOwnGrant(db, ctx.userId, grantId);
  revalidatePath("/rizeni-firmy/asistent");
}
