// 18. 11. 2026 — vše v Řízení firmy kromě Obchodu je jen pro vedení
// (ADMIN, EXECUTIVE). Obchodník (zaměstnanec, crmAuth.ts isSalesRep) smí
// do app/rizeni-firmy/obchod, sem ne. Route group (vedeni) nemění adresy;
// tahle vrstva se vykreslí při každém vstupu z Obchodu sem, takže brána
// platí i pro přechod odkazem, nejen pro přímé otevření adresy.
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isAdminOrExecutive } from "@/lib/data/adminAuth";
import { isSalesRep } from "@/lib/data/crmAuth";

export const dynamic = "force-dynamic";

export default async function VedeniLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!isAdminOrExecutive(ctx)) {
    redirect(isSalesRep(ctx) ? "/rizeni-firmy/obchod" : "/");
  }
  return <>{children}</>;
}
