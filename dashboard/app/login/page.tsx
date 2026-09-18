// Security Phase 2.4 — produkční zákaznický přihlašovací formulář
// (nahrazuje dřívější interní testovací stránku identity z Fáze 2.1–2.3).
// Žádný session dump, žádný debug panel — jen e-mail + heslo. Diagnostika
// requireOrgAccess() se přesunula na dočasnou /internal/auth-debug.
import { redirect } from "next/navigation";
import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import DecorativeMark from "@/components/DecorativeMark";
import { auth } from "@/lib/auth/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { data: session } = await auth.getSession();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden flex items-center">
      <DecorativeMark />
      <div className="max-w-[380px] w-full mx-auto px-3 relative z-10">
        <div className="flex justify-center mb-6">
          <Image src={logoMark} alt="Begina" className="h-10 w-auto" priority />
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <p className="text-lg font-medium text-begina-primary-900 mb-1">Přihlášení</p>
          <p className="text-sm text-neutral-600 mb-5">
            Přihlaste se e-mailem a heslem, které jste od nás dostali.
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
