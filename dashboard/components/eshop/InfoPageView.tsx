import Link from "next/link";
import type { ReactNode } from "react";
import { OPERATOR, type InfoPage } from "@/lib/eshop/infoPages";

// Informační stránka e-shopu (O nás, O vodě, Doprava, Obchodní podmínky, GDPR).
// Obsah: lib/eshop/infoPages.ts.

// E-mail, telefon a webové adresy v textu jako odkazy (adresa i s cestou,
// např. „www.begina.cz/gdpr/“ — tečka za koncem věty do odkazu nepatří).
const LINKABLE = /(info@begina\.cz|\+420 774 199 975|www\.[a-z0-9.-]*[a-z0-9](?:\/[a-z0-9_/-]*[a-z0-9/])?|adr\.coi\.cz)/g;

function linkHref(token: string): string {
  if (token.includes("@")) return `mailto:${token}`;
  if (token.startsWith("+")) return `tel:${token.replaceAll(" ", "")}`;
  return `https://${token}`;
}

export function linkify(text: string): ReactNode[] {
  return text.split(LINKABLE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={linkHref(part)}
        className="underline underline-offset-2 whitespace-nowrap"
        {...(part.startsWith("www.") || part.startsWith("adr.") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export default function InfoPageView({ page, children }: { page: InfoPage; children?: ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{page.title}</h1>
      {page.subtitle && <p className="mt-1 text-sm text-neutral-500">{page.subtitle}</p>}

      {page.blocks ? (
        <div className="mt-6 flex flex-col gap-6 text-neutral-700 leading-relaxed">
          {page.blocks.map((block, i) => (
            <section key={block.heading ?? i}>
              {block.heading && <h2 className="font-medium text-lg text-begina-primary-900 mb-2">{block.heading}</h2>}
              {block.subheading && <h3 className="font-medium text-begina-primary-900 mb-1.5">{block.subheading}</h3>}
              {block.paragraphs?.map((text) => (
                <p key={text} className="mb-2">
                  {linkify(text)}
                </p>
              ))}
              {block.lines && (
                <p className="my-2 pl-3 border-l-2 border-neutral-200 text-neutral-600">
                  {block.lines.map((line, j) => (
                    <span key={line} className="block">
                      {j === 0 ? <strong className="font-medium text-begina-primary-900">{line}</strong> : linkify(line)}
                    </span>
                  ))}
                </p>
              )}
              {block.items &&
                (block.itemStyle === "check" ? (
                  <ul className="flex flex-col gap-1.5">
                    {block.items.map((item) => (
                      <li key={item}>✔ {linkify(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <ul className="flex flex-col gap-2 list-disc pl-5">
                    {block.items.map((item) => (
                      <li key={item}>{linkify(item)}</li>
                    ))}
                  </ul>
                ))}
              {block.points && (
                <ol className="flex flex-col gap-2.5 list-decimal pl-6 marker:text-neutral-500">
                  {block.points.map((point) => (
                    <li key={point.text} className="pl-1">
                      {linkify(point.text)}
                      {point.lines && (
                        <p className="my-2 pl-3 border-l-2 border-neutral-200 text-neutral-600">
                          {point.lines.map((line, j) => (
                            <span key={line} className="block">
                              {j === 0 ? <strong className="font-medium text-begina-primary-900">{line}</strong> : linkify(line)}
                            </span>
                          ))}
                        </p>
                      )}
                      {point.items && (
                        <ul className="mt-1.5 flex flex-col gap-1 list-disc pl-5">
                          {point.items.map((item) => (
                            <li key={item}>{linkify(item)}</li>
                          ))}
                        </ul>
                      )}
                      {point.after && <p className="mt-1">{linkify(point.after)}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {block.afterParagraphs?.map((text) => (
                <p key={text} className="mt-2">
                  {linkify(text)}
                </p>
              ))}
            </section>
          ))}
          {page.pendingNote && <p className="text-sm text-neutral-500">{page.pendingNote}</p>}
        </div>
      ) : (
        <div className="mt-6 border border-neutral-200 rounded-2xl p-5 text-neutral-700">
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

      {children}

      <p className="mt-8 text-sm text-neutral-500">
        Provozovatel: {OPERATOR.name}, {OPERATOR.address}, IČO {OPERATOR.ico}
      </p>
      <Link href="/eshop" className="mt-4 inline-block text-sm font-medium underline underline-offset-2">
        Zpět do e-shopu
      </Link>
    </article>
  );
}
