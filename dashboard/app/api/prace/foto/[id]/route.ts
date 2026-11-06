// Práce 2.0 — zobrazení fotografie: ověří oprávnění (zaměstnanec, kterému
// úkol patří, nebo vedoucí) a přesměruje na podepsaný odkaz do soukromého
// úložiště platný 5 minut. Odkaz se nikde neukládá ani nesdílí.
import { NextResponse } from "next/server";
import { resolveWorkTaskPhoto } from "@/lib/data/workTasks";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";
import { getPhotoStorage } from "@/lib/prace/photoStorage";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, ctx: RouteContext<"/api/prace/foto/[id]">) {
  const { id } = await ctx.params;
  try {
    const photo = await resolveWorkTaskPhoto(id);
    const storage = getPhotoStorage();
    if (!photo || !storage) return new NextResponse("Fotografie nebyla nalezena.", { status: 404, headers: noStore });
    const url = await storage.signedGetUrl(photo.storageKey);
    return NextResponse.redirect(url, { status: 302, headers: noStore });
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      return new NextResponse("Fotografie nebyla nalezena.", { status: 404, headers: noStore });
    }
    console.error("Zobrazení fotografie selhalo", error);
    return new NextResponse("Fotografii se nepodařilo načíst.", { status: 500, headers: noStore });
  }
}
