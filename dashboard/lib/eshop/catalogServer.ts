import "server-only";

// ESHOP 1.0 — katalog pro serverové komponenty a server actions e-shopu.
// cache() = jedno načtení z DB na request, i když ho čte layout, stránka
// i pokladna.
import { cache } from "react";
import { db } from "@/lib/db/client";
import { loadCatalog } from "./catalogDb";
import { createCatalogIndex } from "./catalogIndex";

export const getCatalog = cache(() => loadCatalog(db));

export const getCatalogIndex = cache(async () => createCatalogIndex(await getCatalog()));
