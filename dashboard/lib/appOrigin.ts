import "server-only";
import { headers } from "next/headers";

// P0 hotfix — aktivační/reset odkaz se dřív vždy odvozoval z Host hlavičky
// příchozího požadavku. Když ADMIN akci ("Pozvat zákazníka"/"Poslat znovu
// odkaz") spustil, zatímco sám prohlížel appku přes *.vercel.app doménu
// (chráněnou Vercel Deployment Protection), ne přes moje.begina.cz, odkaz
// v e-mailu vedl na tu chráněnou Vercel doménu — příjemce místo
// /nastavit-heslo narazil na Vercel přihlašovací stránku. V produkci
// (VERCEL_ENV === "production") proto origin pevně fixujeme na jedinou
// skutečnou produkční doménu bez ohledu na to, odkud ADMIN akci spustil.
// Mimo produkci (Preview/dev) zůstává odvození z hlavičky beze změny.
export async function getAppOrigin(): Promise<string> {
  if (process.env.VERCEL_ENV === "production") {
    return "https://moje.begina.cz";
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "moje.begina.cz";
  return `${proto}://${host}`;
}
