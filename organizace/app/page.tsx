import MindMap from "@/components/MindMap";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10 sm:py-14">
      <header className="mb-10 sm:mb-14">
        <p className="text-xs font-medium uppercase tracking-widest text-lucie-500">
          Organizace
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-lucie-900 sm:text-3xl">
          Lucie Königsbergová
        </h1>
        <p className="mt-2 max-w-xl text-sm text-lucie-500">
          Přehled všech pracovních oblastí na jednom místě.
        </p>
      </header>

      <MindMap />
    </main>
  );
}
