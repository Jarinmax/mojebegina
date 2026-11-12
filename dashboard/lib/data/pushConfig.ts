// Jarda — upozornění na naplánovaný hovor 1.0. VAPID klíče pro Web Push —
// bez nich endpoint/cron upozornění prostě neposílá (žádná výjimka navenek,
// stejný princip jako stripeConfig.ts). NEXT_PUBLIC_VAPID_PUBLIC_KEY musí
// být dostupný i v prohlížeči (odběr vzniká tam), VAPID_PRIVATE_KEY a
// VAPID_SUBJECT ("mailto:info@begina.cz") jen na serveru.
type Env = Record<string, string | undefined>;

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

export function pushConfig(env: Env = process.env): PushConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !subject) {
    return null;
  }
  return { publicKey, privateKey, subject };
}
