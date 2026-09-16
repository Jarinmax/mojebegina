// Zatím NEPOUŽITO — žádná stránka ani komponenta tento soubor neimportuje.
// Připraveno pro Fázi 2.1, kdy se napojí na autorizovanou vrstvu lib/data/*.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
