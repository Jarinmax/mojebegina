// Práce 2.0 — nahrání fotografie k úkolu (multipart: taskId + photo).
// Oprávnění, kontrolu a vyčištění souboru dělá datová vrstva
// (addWorkTaskPhoto); tady jen ochrana požadavku a limit velikosti.
import { NextResponse } from "next/server";
import { addWorkTaskPhoto } from "@/lib/data/workTasks";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";
import { MAX_PHOTO_BYTES } from "@/lib/prace/jpeg";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

/** Jen požadavky z vlastní stránky (ochrana proti CSRF z cizího webu). */
function isSameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // stejný původ bez hlavičky (starší prohlížeče); session cookie je stejně SameSite
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Nepovolený požadavek." }, 403);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_PHOTO_BYTES + 64 * 1024) return json({ error: "Fotografie je příliš velká (max. 4 MB)." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Neplatný požadavek." }, 400);
  }
  const taskId = String(form.get("taskId") ?? "");
  const photo = form.get("photo");
  if (!(photo instanceof File)) return json({ error: "Chybí fotografie." }, 400);
  if (photo.size > MAX_PHOTO_BYTES) return json({ error: "Fotografie je příliš velká (max. 4 MB)." }, 413);

  try {
    const result = await addWorkTaskPhoto(taskId, new Uint8Array(await photo.arrayBuffer()));
    return result.ok ? json({ ok: true, photoId: result.photoId }) : json({ error: result.error }, 400);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return json({ error: "Přihlaste se prosím znovu." }, 401);
    if (error instanceof ForbiddenError) return json({ error: "K úkolu nemáte přístup." }, 403);
    console.error("Nahrání fotografie selhalo", error);
    return json({ error: "Fotografii se nepodařilo uložit. Zkuste to prosím znovu." }, 500);
  }
}
