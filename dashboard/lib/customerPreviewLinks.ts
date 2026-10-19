// Odkud se do náhledu zákaznické karty přišlo — pevný výčet (nikdy
// libovolná adresa z URL): kam vede „Zpět do administrace“.
export type PreviewOrigin = "admin" | "executive" | "crm";

export function parsePreviewOrigin(raw: string | string[] | undefined): PreviewOrigin | null {
  return raw === "admin" || raw === "executive" || raw === "crm" ? raw : null;
}

export function previewBackHref(origin: PreviewOrigin, organizationId: string): string {
  if (origin === "admin") return `/admin/organizace/${organizationId}`;
  if (origin === "executive") return `/executive/organizace/${organizationId}`;
  return `/rizeni-firmy/obchod/zakaznici/${organizationId}`;
}

export function previewHref(organizationId: string, origin: PreviewOrigin, view?: string): string {
  return `/nahled-zakaznika/${organizationId}?zpet=${origin}${view ? `&zobrazeni=${view}` : ""}`;
}
