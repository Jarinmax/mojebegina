"use server";

// Palivový příplatek CoolBalík (22. 11. 2026): jednou měsíčně ho zapíše Lucie nebo Jarin,
// ceny dopravy na e-shopu (košík, pokladna, ceník, tabulka porcí) se přepočítají samy.
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { saveFuelSurchargePercent } from "@/lib/eshop/fuelSurchargeServer";
import { carrierPriceKc, validFuelPercent } from "@/lib/eshop/shippingRates";

export type FuelActionState = { error: string } | { success: string } | null;

export async function saveFuelSurchargeAction(_prev: FuelActionState, formData: FormData): Promise<FuelActionState> {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) return { error: "Palivový příplatek smí měnit jen Jaroslav Viner a Lucie Königsbergová." };
  const percent = validFuelPercent(formData.get("percent"));
  if (percent === null) return { error: "Zadejte procento mezi 0 a 60, například 16 nebo 17,5." };
  try {
    await saveFuelSurchargePercent(percent, ctx.userId);
  } catch (error) {
    console.error("Palivový příplatek: uložení selhalo", error);
    return { error: "Uložit se nepodařilo — chybí tabulka eshop_settings (spusťte SQL 0062 v Neonu)." };
  }
  revalidatePath("/rizeni-firmy/doprava-kalkulacka");
  revalidatePath("/", "layout");
  return { success: `Uloženo: ${percent.toLocaleString("cs-CZ")} %. Doprava do 14,99 kg teď stojí ${carrierPriceKc(190, percent).toLocaleString("cs-CZ")} Kč.` };
}
