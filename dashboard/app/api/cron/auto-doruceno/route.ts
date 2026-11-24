// Automatické „Doručená“ 2 pracovní dny po „Předáno přepravci“ (Lucie 24. 11. 2026).
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { runAutoDelivered } from "@/lib/eshop/autoDeliveredServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const delivered = await runAutoDelivered();
  return Response.json({ delivered });
}
