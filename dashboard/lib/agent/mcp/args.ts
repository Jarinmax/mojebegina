// GPT/MCP pilot — kontrola argumentů nástrojů. Model posílá JSON podle
// inputSchema, ale nic z toho se nebere jako ověřené: každý argument se tu
// znovu zkontroluje (typ, délka, formát id) dřív, než se dotkne datové
// vrstvy. Čisté funkce, testované v __tests__/args.test.ts.

export class ArgError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function optionalString(args: Record<string, unknown>, key: string, max: number): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ArgError(`Argument ${key} musí být text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ArgError(`Argument ${key} je příliš dlouhý (max. ${max} znaků).`);
  return trimmed === "" ? null : trimmed;
}

export function requiredString(args: Record<string, unknown>, key: string, max: number): string {
  const value = optionalString(args, key, max);
  if (value === null) throw new ArgError(`Chybí argument ${key}.`);
  return value;
}

export function requiredUuid(args: Record<string, unknown>, key: string): string {
  const value = requiredString(args, key, 36);
  if (!UUID_RE.test(value)) throw new ArgError(`Argument ${key} musí být id (UUID) — najděte ho nejdřív vyhledáním.`);
  return value.toLowerCase();
}

export function optionalBoolean(args: Record<string, unknown>, key: string): boolean | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new ArgError(`Argument ${key} musí být true/false.`);
  return value;
}

export function optionalEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T | null {
  const value = optionalString(args, key, 50);
  if (value === null) return null;
  if (!allowed.includes(value as T)) throw new ArgError(`Argument ${key} musí být jedno z: ${allowed.join(", ")}.`);
  return value as T;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,100}$/;

export function idempotencyKey(args: Record<string, unknown>): string {
  const value = args.idempotency_key;
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_RE.test(value)) {
    throw new ArgError(
      "Chybí nebo je neplatný idempotency_key (8–100 znaků: písmena, číslice, . _ : -). Pro každý nový zápis vygenerujte nový, např. UUID."
    );
  }
  return value;
}
