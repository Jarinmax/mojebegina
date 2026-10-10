import type { MetadataRoute } from "next";

// moje.begina.cz (MojeBegina) a Preview se neindexují nikdy. Na begina.cz
// /robots.txt obslouží app/eshop/robots.txt (proxy.ts) — sem nedojde.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
