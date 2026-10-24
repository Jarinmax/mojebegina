// GPT/MCP pilot — vygeneruje heslo a jeho SCRAM-SHA-256 otisk pro roli
// lucy_readonly (30_production_readonly_role.sql). Spouští se LOKÁLNĚ:
//     node docs/gpt-mcp/scram-verifier.mjs
// Heslo uložte do správce hesel a do připojovacího řetězce ve Vercelu
// (proměnná jen pro pilotní větev). Do SQL patří JEN otisk — Postgres ho
// přijme místo hesla, ale z otisku heslo zpětně získat nejde.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

export function scramVerifier(password, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // jen písmena a číslice — bez znaků, které by bylo nutné v URL escapovat
  const password = randomBytes(32).toString("base64url").replace(/[-_]/g, "x");
  console.log("HESLO (jen do správce hesel a Vercelu, nikam jinam):");
  console.log(password);
  console.log("\nOTISK pro SQL (do řádku „verifier text := …“ v 30_production_readonly_role.sql):");
  console.log(scramVerifier(password));
}
