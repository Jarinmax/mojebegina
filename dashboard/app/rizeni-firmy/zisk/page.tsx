import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { pragueToday } from "@/lib/data/callActivityValidation";
import { profitByMonth } from "@/lib/ekonomika/beginaProfit";
import ZiskView from "./ZiskView";
import { loadProfitInvoices } from "@/lib/ekonomika/beginaProfitServer";
import { loadRecipes, recipeTablesExist } from "@/lib/receptury/recipesServer";

// ZISK BEGINY (Lucie 28. 11. 2026): tržba bez dopravy − suroviny − obaly
// po měsících + kolik surovin a obalů jsme za měsíc spotřebovali (= kolik
// peněz měsíčně potřebujeme na nákup). Náklady jako ve Výrobě: z receptur
// a dnešních cen v Nákladech a maržích. Vidí jen Lucie a Jarin.
export const dynamic = "force-dynamic";

export default async function ZiskPage({ searchParams }: { searchParams: Promise<{ rok?: string; mesic?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  if (!(await recipeTablesExist())) notFound();
  const sp = await searchParams;
  const today = pragueToday(new Date());
  const nowY = Number(today.slice(0, 4));
  const year = Math.min(Math.max(Number(sp.rok) || nowY, 2020), nowY);

  const [invoices, { recipes, ingredients }] = await Promise.all([loadProfitInvoices(year), loadRecipes()]);
  const months = profitByMonth(invoices, recipes, ingredients);

  return <ZiskView year={year} nowYear={nowY} months={months} selectedMonth={Number(sp.mesic) || null} />;
}
