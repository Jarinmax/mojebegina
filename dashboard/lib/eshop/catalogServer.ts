import "server-only";

// ESHOP 1.0 — katalog pro serverové komponenty a server actions e-shopu.
// cache() = jedno načtení z DB na request, i když ho čte layout, stránka
// i pokladna.
import { cache } from "react";
import { db } from "@/lib/db/client";
import { loadCatalog } from "./catalogDb";
import { createCatalogIndex } from "./catalogIndex";
import { shippingModeFromEnv } from "./shipping";

// Hmotnosti balení jen s dopravou podle hmotnosti (ESHOP_WEIGHT_SHIPPING=on).
export const getCatalog = cache(() => loadCatalog(db, { weights: shippingModeFromEnv() === "weight" }));

export const getCatalogIndex = cache(async () => createCatalogIndex(await getCatalog()));
