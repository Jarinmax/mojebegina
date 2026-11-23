// Doklady — „Stáhnout vše (ZIP)“ za měsíc: příjmy (PDF z archivu iDokladu + faktury MojeBegina) a/nebo
// náklady (nahrané doklady). Jen Jaroslav a Lucie.
import { NextResponse, type NextRequest } from "next/server";
import { zipSync } from "fflate";
import { DocumentAccessError, isValidMonth, readMonthDocumentFiles, requireDocumentAccess } from "@/lib/doklady/documents";
import { runIdokladRead } from "@/lib/idoklad-read/tools";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ownDocumentPdf } from "@/lib/eshop/invoicing/ownIssue";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  let i = 2;
  while (used.has(candidate)) {
    candidate = name.replace(/(\.[^.]+)?$/, (ext) => ` (${i})${ext}`);
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("mesic") ?? "";
  const typ = request.nextUrl.searchParams.get("typ") ?? "vse";
  if (!isValidMonth(month) || !["prijmy", "naklady", "vse"].includes(typ)) {
    return new NextResponse("Neplatný měsíc nebo typ.", { status: 400 });
  }
  try {
    await requireDocumentAccess();
  } catch (error) {
    if (error instanceof DocumentAccessError) return new NextResponse(error.message, { status: 403 });
    throw error;
  }
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  if (typ !== "naklady") {
    const read = await runIdokladRead("idoklad_month_pdfs", { date_from: `${month}-01`, date_to: lastDay(month) }, "ui");
    if (!read.ok) return new NextResponse(`Faktury z iDokladu se nepodařilo načíst: ${read.error}`, { status: 502 });
    for (const f of (read.data.files as { filename: string; contentBase64: string }[]) ?? []) {
      files[`prijmy/${uniqueName(f.filename, used)}`] = new Uint8Array(Buffer.from(f.contentBase64, "base64"));
    }
    // faktury vystavené v MojeBegina (od 20260215), stornované zvlášť
    const own = (await db.execute(sql`
      SELECT id, number, state FROM own_invoice_documents
      WHERE issue_date BETWEEN ${`${month}-01`}::date AND ${lastDay(month)}::date ORDER BY number`)).rows as { id: string; number: string; state: string }[];
    for (const doc of own) {
      const pdf = await ownDocumentPdf(db, doc.id);
      if (!pdf) continue;
      const folder = doc.state === "cancelled" ? "prijmy/stornovane" : "prijmy";
      files[`${folder}/${uniqueName(pdf.filename, used)}`] = new Uint8Array(Buffer.from(pdf.contentBase64, "base64"));
    }
  }
  if (typ !== "prijmy") {
    for (const f of await readMonthDocumentFiles(month)) {
      files[`naklady/${uniqueName(f.filename, used)}`] = f.bytes;
    }
  }
  if (Object.keys(files).length === 0) return new NextResponse("V tomto měsíci nejsou žádné doklady ke stažení.", { status: 404 });
  const zip = zipSync(files, { level: 0 });
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="doklady-begina-${month}${typ === "vse" ? "" : `-${typ}`}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
