// Denní souhrn zápisů obchodníků k leadům (Lucie 24. 11. 2026: „chci, aby mi
// chodily upozornění, když prodejci zapíšou informace k leadům“). Jeden e-mail
// denně v 19:00 na info@begina.cz — po obchodnících, u každého zápisu lead,
// čas, text a další krok. Když za den nic nezapsali, nic se neposílá.
import { MOJEBEGINA_ORIGIN } from "@/lib/eshop/overdueOrders";

export type DigestEntry = {
  leadId: string;
  leadName: string;
  authorName: string;
  createdAt: Date;
  body: string;
  noAnswer: boolean;
  nextFollowUpAt: Date | null;
};

const time = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "numeric", minute: "2-digit" });
const dayTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const leadUrl = (id: string) => `${MOJEBEGINA_ORIGIN}/rizeni-firmy/obchod/leady/${id}`;
const plural = (n: number) => (n === 1 ? "zápis" : n >= 2 && n <= 4 ? "zápisy" : "zápisů");

export function buildLeadDigestEmail(entries: DigestEntry[], dayLabel: string): { subject: string; html: string; text: string } | null {
  if (entries.length === 0) return null;
  const byAuthor = new Map<string, DigestEntry[]>();
  for (const e of [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const list = byAuthor.get(e.authorName) ?? [];
    list.push(e);
    byAuthor.set(e.authorName, list);
  }
  const subject = `Obchod ${dayLabel}: ${entries.length} ${plural(entries.length)} k leadům`;
  const htmlParts: string[] = [];
  const textParts: string[] = [];
  for (const [author, list] of byAuthor) {
    const reached = list.filter((e) => !e.noAnswer).length;
    const head = `${author} — ${list.length} ${plural(list.length)} (dovolal/a: ${reached}, nezvedli: ${list.length - reached})`;
    htmlParts.push(`<h3 style="margin:20px 0 8px;font-size:15px;">${esc(head)}</h3>`);
    textParts.push(`${head}\n——————`);
    list.forEach((e, i) => {
      const next = e.nextFollowUpAt ? `Další krok: ${dayTime.format(e.nextFollowUpAt)}` : "Další krok: bez termínu";
      htmlParts.push(
        `<p style="margin:0 0 12px;"><strong>${i + 1}. <a href="${esc(leadUrl(e.leadId))}" style="color:#1A1A1A;">${esc(e.leadName)}</a></strong> · ${esc(time.format(e.createdAt))}<br>` +
          `${e.noAnswer ? "📵 " : "✅ "}${esc(e.body)}<br><span style="color:#666;">${esc(next)}</span></p>`
      );
      textParts.push(`${i + 1}. ${e.leadName} · ${time.format(e.createdAt)}\n${e.noAnswer ? "📵 " : "✅ "}${e.body}\n${next}\n${leadUrl(e.leadId)}\n`);
    });
  }
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A1A;"><p style="margin:0 0 4px;">Zápisy obchodníků k leadům – ${esc(dayLabel)}</p>${htmlParts.join("")}</div>`;
  const text = `Zápisy obchodníků k leadům – ${dayLabel}\n\n${textParts.join("\n")}`;
  return { subject, html, text };
}
