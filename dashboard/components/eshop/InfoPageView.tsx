import EshopFileLink from "./EshopFileLink";
import ShopLink from "./ShopLink";
import Image from "next/image";
import { Fragment, type ReactNode } from "react";
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
      <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">{page.title}</h1>
      {page.subtitle && <p className="mt-1 text-sm text-neutral-500">{page.subtitle}</p>}
      {page.download && (
        <p className="mt-3 text-sm">
          <EshopFileLink href={page.download.path} className="underline underline-offset-2">
            {page.download.label}
          </EshopFileLink>
        </p>
      )}
      {page.secondaryDownload && (
        <p className="mt-1.5 text-sm">
          <EshopFileLink href={page.secondaryDownload.path} className="font-medium underline underline-offset-2">
            {page.secondaryDownload.label}
          </EshopFileLink>
        </p>
      )}

      {page.jumpLinks && page.jumpLinks.length > 1 && (
        <nav aria-label="Oddíly stránky" className="mt-4 flex flex-wrap gap-2">
          {page.jumpLinks.map((link) => (
            <a
              key={link.anchor}
              href={`#${link.anchor}`}
              className="inline-flex items-center rounded-full border border-begina-primary-900/20 bg-white px-4 py-2 text-sm font-medium text-begina-primary-900 hover:bg-begina-primary-900/5"
            >
              {link.label} ↓
            </a>
          ))}
        </nav>
      )}

      {page.blocks ? (
        <div className="mt-6 flex flex-col gap-6 text-neutral-700 leading-relaxed">
          {page.blocks.map((block, i) => (
            <section key={block.heading ?? i} id={block.anchor} className={block.anchor ? "scroll-mt-28" : undefined}>
              {block.heading && <h2 className="font-medium text-lg text-begina-primary-900 mb-2">{block.heading}</h2>}
              {block.subheading && <h3 className="font-medium text-begina-primary-900 mb-1.5">{block.subheading}</h3>}
              {block.paragraphs?.map((text, j) => (
                <Fragment key={text}>
                  <p className="mb-2">{linkify(text)}</p>
                  {j === 0 && block.image && (
                    <Image
                      src={block.image.src}
                      alt={block.image.alt}
                      width={block.image.width ?? 1200}
                      height={block.image.height ?? 1200}
                      sizes="(min-width: 640px) 24rem, 90vw"
                      className="my-5 w-full max-w-sm mx-auto rounded-2xl"
                    />
                  )}
                </Fragment>
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
              {block.rows && block.rowsHeader && (
                <table className="w-full max-w-md my-3 text-sm sm:text-base tabular-nums border border-neutral-200 rounded-xl overflow-hidden border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-begina-primary-900/5 text-begina-primary-900">
                      <th scope="col" className="text-left font-medium px-4 py-2">{block.rowsHeader[0]}</th>
                      <th scope="col" className="text-right font-medium px-4 py-2">{block.rowsHeader[1]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map(([left, right], j) => (
                      <tr key={left} className={j % 2 === 1 ? "bg-neutral-50" : "bg-white"}>
                        <th scope="row" className="text-left align-middle leading-normal font-normal px-4 py-1.5 border-t border-neutral-100">{left}</th>
                        <td className="text-right align-middle leading-normal font-medium text-begina-primary-900 whitespace-nowrap px-4 py-1.5 border-t border-neutral-100">{right}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {block.rows && !block.rowsHeader && (
                <table className="w-full my-1 border-separate border-spacing-y-1">
                  <tbody>
                    {block.rows.map(([left, right]) => (
                      <tr key={left} className="bg-neutral-50">
                        <th scope="row" className="text-left font-normal px-3 py-2 rounded-l-lg">{left}</th>
                        <td className="font-medium text-begina-primary-900 px-3 py-2 rounded-r-lg">{right}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {block.items &&
                (block.heading?.startsWith("Příloha:") ? (
                  <div className="border border-neutral-300 rounded-2xl p-4 sm:p-6 flex flex-col gap-4 break-inside-avoid">
                    {block.items.map((item) => (
                      <div key={item}>
                        <p>{linkify(item)}</p>
                        {item.endsWith(":") && (
                          <span aria-hidden="true" className="block h-7 border-b border-dotted border-neutral-400" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : block.itemStyle === "check" ? (
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

      {!page.hideOperatorLine && (
        <p className="mt-8 text-sm text-neutral-500">
          Provozovatel: {OPERATOR.name}, sídlo {OPERATOR.address}, IČO {OPERATOR.ico}
        </p>
      )}
      <ShopLink href="/" className="mt-4 inline-block text-sm font-medium underline underline-offset-2">
        Zpět do e-shopu
      </ShopLink>
    </article>
  );
}
