"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { submitCafeInquiry } from "@/lib/eshop/cafeInquirySubmit";
import { cafeFormPlace, type CafeField } from "@/lib/eshop/cafePage";

export type CafeFormState = { status: "idle" } | { status: "error"; error: string; field?: CafeField } | { status: "done" };

/** Odkaz na kontakt v upozornění vede vždy do MojeBegina (na begina.cz by nefungoval). */
async function crmBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  if (/^(www\.)?begina\.cz$/.test(host)) return "https://moje.begina.cz";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function submitCafeInquiryAction(_prev: CafeFormState, formData: FormData): Promise<CafeFormState> {
  if (!isEshopPublic()) return { status: "error", error: "Formulář je teď nedostupný." };
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  // Past na roboty (skryté pole, člověk ho nevyplní) — tváří se jako úspěch, nic neuloží.
  if (field("web")) return { status: "done" };
  const result = await submitCafeInquiry(
    db,
    { venue: field("venue"), name: field("name"), phone: field("phone"), email: field("email"), city: field("city"), note: field("note") },
    { baseUrl: await crmBaseUrl(), place: cafeFormPlace(field("misto")) }
  );
  if (!result.ok) return { status: "error", error: result.error, field: result.field };
  return { status: "done" };
}
