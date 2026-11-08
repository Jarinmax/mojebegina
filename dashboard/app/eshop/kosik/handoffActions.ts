"use server";

// Přechod z MojeBegina do e-shopu (lib/eshop/customerHandoff.ts): ověření
// podepsaného pasu na serveru, položky objednávky k zopakování a údaje
// karty pro pokladnu. Prohlížeč dostane jen to, co se týká jeho karty.
import { db } from "@/lib/db/client";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import {
  handoffSecret,
  loadHandoffPrefill,
  loadReorderItems,
  reorderLines,
  verifyHandoff,
  type HandoffPrefill,
} from "@/lib/eshop/customerHandoff";
import { isEshopPublic } from "@/lib/eshop/storeMode";

const EXPIRED = "Odkaz z MojeBegina už neplatí. Otevřete prosím „Objednat znovu“ v MojeBegina ještě jednou.";

export type HandoffAccepted =
  | { ok: true; organizationName: string; lines: { sku: string; quantity: number }[]; skipped: string[]; reorder: boolean }
  | { ok: false; error: string };

export async function acceptHandoffAction(token: string): Promise<HandoffAccepted> {
  if (!isEshopPublic()) return { ok: false, error: EXPIRED };
  const secret = handoffSecret();
  const payload = secret ? verifyHandoff(token, secret) : null;
  if (!payload) return { ok: false, error: EXPIRED };
  const prefill = await loadHandoffPrefill(db, payload);
  if (!prefill) return { ok: false, error: EXPIRED };
  if (!payload.r) return { ok: true, organizationName: prefill.company.name, lines: [], skipped: [], reorder: false };
  const items = await loadReorderItems(db, payload.o, payload.r);
  if (!items) return { ok: false, error: EXPIRED };
  const result = reorderLines(items, await getCatalogIndex());
  return { ok: true, organizationName: prefill.company.name, lines: result.lines, skipped: result.skipped, reorder: true };
}

export type HandoffPrefillResult = { ok: true; prefill: HandoffPrefill } | { ok: false; error: string };

export async function handoffPrefillAction(token: string): Promise<HandoffPrefillResult> {
  if (!isEshopPublic()) return { ok: false, error: EXPIRED };
  const secret = handoffSecret();
  const payload = secret ? verifyHandoff(token, secret) : null;
  const prefill = payload ? await loadHandoffPrefill(db, payload) : null;
  return prefill ? { ok: true, prefill } : { ok: false, error: EXPIRED };
}
