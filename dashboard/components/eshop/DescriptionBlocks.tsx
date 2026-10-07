import { splitBold, type DescriptionBlock } from "@/lib/eshop/productDescription";

// Odstavce a odrážky z popisu produktu (lib/eshop/productDescription.ts).
function Rich({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-medium text-begina-primary-900">
            {part.text}
          </strong>
        ) : (
          part.text
        )
      )}
    </>
  );
}

export default function DescriptionBlocks({ blocks }: { blocks: DescriptionBlock[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "p" ? (
          <p key={i}>
            <Rich text={block.text} />
          </p>
        ) : (
          <ul key={i} className="list-disc pl-5 flex flex-col gap-1">
            {block.items.map((item) => (
              <li key={item}>
                <Rich text={item} />
              </li>
            ))}
          </ul>
        )
      )}
    </>
  );
}
