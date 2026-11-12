// Katalog produktů pro Google Merchant Center (12. 11. 2026) — RSS 2.0
// s prostorem jmen g:. Jedna položka = jedno balení (3 l, 650 ml…), varianty
// spojuje g:item_group_id. Data jen z katalogu; nic se nevymýšlí.
// Alkoholické produkty (18+) se do katalogu nedávají — zvláštní pravidla Google.
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";
import { isOrderable } from "./productRules";
import { plainText, truncate } from "./seo";
import type { Catalog, Product } from "./types";

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const abs = (url: string) => (/^https?:\/\//.test(url) ? url : `${PUBLIC_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`);

function photos(product: Product): string[] {
  const urls = product.gallery?.length ? product.gallery.map((p) => p.url) : product.image ? [product.image] : [];
  return urls.map(abs);
}

function description(product: Product): string {
  const text = product.description.filter((line) => !/^\s*#/.test(line)).map(plainText).join(" ");
  return truncate(text || product.shortDescription || product.name, 4900);
}

export function googleMerchantFeed(catalog: Catalog): string {
  const categoryName = new Map(catalog.categories.map((c) => [c.slug, c.name]));
  const items = catalog.products
    .filter((product) => !product.isAgeRestricted && product.variants.length > 0)
    .flatMap((product) => {
      const images = photos(product);
      if (!images.length) return [];
      const link = `${PUBLIC_ORIGIN}/produkt/${product.slug}`;
      const availability = isOrderable(product) ? "in_stock" : "out_of_stock";
      const desc = description(product);
      return product.variants.map((variant) =>
        [
          "    <item>",
          `      <g:id>${esc(variant.sku)}</g:id>`,
          `      <g:item_group_id>${esc(product.slug)}</g:item_group_id>`,
          `      <g:title>${esc(variant.label ? `${product.name} ${variant.label}` : product.name)}</g:title>`,
          `      <g:description>${esc(desc)}</g:description>`,
          `      <g:link>${esc(link)}</g:link>`,
          `      <g:image_link>${esc(images[0])}</g:image_link>`,
          ...images.slice(1, 11).map((url) => `      <g:additional_image_link>${esc(url)}</g:additional_image_link>`),
          `      <g:availability>${availability}</g:availability>`,
          `      <g:price>${variant.priceKc.toFixed(2)} CZK</g:price>`,
          "      <g:brand>Begina</g:brand>",
          "      <g:condition>new</g:condition>",
          "      <g:identifier_exists>no</g:identifier_exists>",
          `      <g:product_type>${esc(categoryName.get(product.category) ?? product.category)}</g:product_type>`,
          ...(variant.label ? [`      <g:size>${esc(variant.label)}</g:size>`] : []),
          ...(variant.weightGrams ? [`      <g:shipping_weight>${variant.weightGrams} g</g:shipping_weight>`] : []),
          "    </item>",
        ].join("\n")
      );
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    "    <title>Begina</title>",
    `    <link>${PUBLIC_ORIGIN}/</link>`,
    "    <description>Bylinné sirupy, polévky, čaje a nápoje Begina</description>",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
