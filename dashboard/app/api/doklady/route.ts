// Doklady — zápis nahraného dokladu nákladu (po uploadu do Blobu).
import { NextResponse, type NextRequest } from "next/server";
import { DocumentAccessError, registerDocument } from "@/lib/doklady/documents";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  try {
    const result = await registerDocument({
      month: str("month"),
      pathname: str("pathname"),
      filename: str("filename"),
      mimeType: str("mimeType"),
      sha256: str("sha256"),
      entryId: str("entryId") || null,
    });
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
  } catch (error) {
    if (error instanceof DocumentAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
