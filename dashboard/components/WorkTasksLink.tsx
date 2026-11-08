import Link from "next/link";
import { getAuthContext } from "@/lib/data/authContext";
import { LUCIE_USER_ID, isWorkAssignee, isWorkManager } from "@/lib/data/workTasksAuth";
import { ESHOP_CHECK_PATH, ESHOP_CHECK_REGISTER_NAME } from "@/lib/data/eshopCheckRules";

// Práce 1.0 — vstup na /prace jen pro vedoucího a pracovníka z allowlistu
// (workTasksAuth.ts); ostatní uživatelé odkaz vůbec neuvidí.
export default async function WorkTasksLink() {
  const ctx = await getAuthContext();
  if (!isWorkManager(ctx) && !isWorkAssignee(ctx)) return null;
  // registr kontroly e-shopu: vedoucí a Lucie
  const showCheck = isWorkManager(ctx) || ctx?.userId === LUCIE_USER_ID;
  return (
    <>
    {showCheck && (
      <Link
        href={ESHOP_CHECK_PATH}
        className="mb-3 flex items-center justify-between rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-begina-primary-900"
      >
        <span>{ESHOP_CHECK_REGISTER_NAME}</span>
        <span aria-hidden>→</span>
      </Link>
    )}
    <Link
      href="/prace"
      className="mb-5 flex items-center justify-between rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-medium text-begina-primary-900"
    >
      <span>{isWorkManager(ctx) ? "Práce týmu — zadat a sledovat úkoly" : "Moje práce — dnešní úkoly"}</span>
      <span aria-hidden>→</span>
    </Link>
    </>
  );
}
