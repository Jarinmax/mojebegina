import Link from "next/link";
import { OPERATOR, type InfoPage } from "@/lib/eshop/infoPages";

// Informační stránka e-shopu (O nás, Doprava, Obchodní podmínky, GDPR).
// Obsah: lib/eshop/infoPages.ts.
export default function InfoPageView({ page }: { page: InfoPage }) {
  return (
    <article className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">{page.title}</h1>

      {page.blocks ? (
        <div className="flex flex-col gap-6 text-neutral-700 leading-relaxed">
          {page.blocks.map((block, i) => (
            <section key={block.heading ?? i}>
              {block.heading && <h2 className="font-medium text-lg text-begina-primary-900 mb-2">{block.heading}</h2>}
              {block.paragraphs?.map((text) => (
                <p key={text} className="mb-2">
                  {text}
                </p>
              ))}
              {block.items && (
                <ul className="flex flex-col gap-2 list-disc pl-5">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {page.pendingNote && <p className="text-sm text-neutral-500">{page.pendingNote}</p>}
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-2xl p-5 text-neutral-700">
          <p className="font-medium text-begina-primary-900 mb-2">Text připravujeme.</p>
          <p className="text-sm">
            Do té doby nám napište na{" "}
            <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2">
              {OPERATOR.email}
            </a>{" "}
            nebo zavolejte na{" "}
            <a href={OPERATOR.phoneHref} className="underline underline-offset-2 whitespace-nowrap">
              {OPERATOR.phone}
            </a>
            .
          </p>
        </div>
      )}

      <p className="mt-8 text-sm text-neutral-500">
        Provozovatel: {OPERATOR.name}, {OPERATOR.address}, IČO {OPERATOR.ico}
      </p>
      <Link href="/eshop" className="mt-4 inline-block text-sm font-medium underline underline-offset-2">
        Zpět do e-shopu
      </Link>
    </article>
  );
}
