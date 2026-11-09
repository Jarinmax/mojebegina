// Práce 2.0 — zobrazení fotografie: ověří oprávnění (zaměstnanec, kterému
// úkol patří, nebo vedoucí). R2: přesměruje na podepsaný odkaz platný
// 5 minut. Vercel Blob (privátní): fotku streamuje přímo server.
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
    if (storage.read) {
      const stream = await storage.read(photo.storageKey);
      if (!stream) return new NextResponse("Fotografie nebyla nalezena.", { status: 404, headers: noStore });
      return new NextResponse(stream, {
        status: 200,
        headers: { ...noStore, "Content-Type": "image/jpeg", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" },
      });
    }
    if (!storage.signedGetUrl) return new NextResponse("Fotografie nebyla nalezena.", { status: 404, headers: noStore });
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
