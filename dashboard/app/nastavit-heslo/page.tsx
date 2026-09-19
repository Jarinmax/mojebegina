// Security Phase 1.1A — aktivační/reset stránka. Token přichází v query
// stringu (viz better-auth /reset-password/:token redirect na tuhle
// callbackURL s ?token=...). Bez tokenu appka rovnou hlásí neplatný
// odkaz — formulář by beztak selhal na serveru (INVALID_TOKEN), ale takhle
// to uživatel vidí ihned, ne až po pokusu o odeslání.
import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import DecorativeMark from "@/components/DecorativeMark";
import NastavitHesloForm from "./NastavitHesloForm";

export const dynamic = "force-dynamic";

export default async function NastavitHesloPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden flex items-center">
      <DecorativeMark />
      <div className="max-w-[380px] w-full mx-auto px-3 relative z-10">
        <div className="flex justify-center mb-6">
          <Image src={logoMark} alt="Begina" className="h-10 w-auto" priority />
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <p className="text-lg font-medium text-begina-primary-900 mb-1">Nastavit heslo</p>

          {token ? (
            <>
              <p className="text-sm text-neutral-600 mb-5">
                Zvolte si heslo, kterým se budete od teď přihlašovat.
              </p>
              <NastavitHesloForm token={token} />
            </>
          ) : (
            <p className="text-sm text-neutral-600">
              Odkaz je neplatný nebo neúplný. Požádejte o nový aktivační/resetovací e-mail.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
