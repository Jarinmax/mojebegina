// GPT/MCP pilot — souhlasová stránka OAuth (/oauth/authorize). Sem asistent (ChatGPT, Claude)
// pošle uživatele při připojení konektoru. Člověk se přihlásí SVÝM účtem
// MojeBegina (běžný login), uvidí, k čemu asistent dostane přístup, a sám
// rozhodne. Asistent pak jedná vždy za něj a jen s oprávněními jeho účtu.
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import { getAuthContext } from "@/lib/data/authContext";
import { ROLE_LABELS } from "@/lib/data/roles";
import { agentConfig } from "@/lib/agent/config";
import {
  AUTHORIZE_PATH,
  agentEligibleRoles,
  authorizeRedirect,
  checkAuthorizeParams,
  isAgentUserAllowed,
  queryFromParams,
} from "@/lib/agent/oauthCore";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { channelAllowed } from "@/lib/idoklad-read/tools";
import { decideAuthorizationAction } from "./actions";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4">
      <Image src={logoMark} alt="Begina" className="h-9 w-auto mb-6" priority />
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-xl p-5">
        <h1 className="text-lg font-medium text-begina-primary-900 mb-3">{title}</h1>
        {children}
      </div>
    </div>
  );
}

const BUTTON = "w-full text-sm font-medium rounded-lg px-4 py-3 transition-colors";

export default async function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  const config = agentConfig();
  if (!config) notFound();

  const params = (await props.searchParams) ?? {};
  const check = checkAuthorizeParams(config, params);
  if (!check.ok && !check.redirectable) {
    return (
      <Card title="Připojení se nepodařilo">
        <p className="text-sm text-neutral-600">{check.message}</p>
      </Card>
    );
  }
  if (!check.ok) {
    redirect(authorizeRedirect(config, check.redirectUri, check.state, { error: check.error, error_description: check.description }));
  }

  const query = queryFromParams(params);
  const ctx = await getAuthContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`${AUTHORIZE_PATH}?${query}`)}`);

  const assistant = check.value.client.label;
  const idokladRead = channelAllowed(`mcp:${check.value.client.integration}`) && isInvoiceIssuer(ctx);
  const eligible = agentEligibleRoles(ctx.grantedRoles);
  const allowed = isAgentUserAllowed(config, ctx.userId) && eligible.length > 0;

  if (!allowed) {
    return (
      <Card title="Přístup asistenta není povolen">
        <p className="text-sm text-neutral-600 mb-4">
          Účet {ctx.email} zatím nemá povolené propojení s {assistant}. O přístup požádejte správce MojeBegina.
        </p>
        <form action={decideAuthorizationAction}>
          <input type="hidden" name="query" value={query} />
          <button type="submit" name="decision" value="deny" className={`${BUTTON} text-begina-primary-900 bg-neutral-50 border border-neutral-200`}>
            Zpět do {assistant}
          </button>
        </form>
      </Card>
    );
  }

  return (
    <Card title={`Propojit ${assistant} s MojeBegina?`}>
      <p className="text-sm text-neutral-600 mb-4">
        Asistent bude jednat za vás (<span className="font-medium text-begina-primary-900">{ctx.name ?? ctx.email}</span>)
        a jen s oprávněními vašeho účtu. Vše, co zapíše, bude v historii označené „(přes {assistant})“.
      </p>

      <form action={decideAuthorizationAction} className="flex flex-col gap-4">
        <input type="hidden" name="query" value={query} />

        {eligible.length > 1 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs text-neutral-500 mb-1">V jaké roli</legend>
            {eligible.map((role, i) => (
              <label key={role} className="flex items-center gap-2 text-sm text-begina-primary-900">
                <input type="radio" name="role" value={role} defaultChecked={i === 0} />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </fieldset>
        ) : (
          <input type="hidden" name="role" value={eligible[0]} />
        )}

        <div className="flex flex-col gap-2 text-sm text-begina-primary-900">
          <p className="text-xs text-neutral-500">Asistent bude moct</p>
          <p>✓ číst leady, zákazníky a úkoly v Živé mapě firmy</p>
          {idokladRead ? <p>✓ číst vydané faktury a číselné řady v iDokladu (jen čtení, každý přístup se zaznamená)</p> : null}
          {!config.writeEnabled ? (
            <p className="text-neutral-500">Zápisy jsou zatím vypnuté — asistent bude jen číst.</p>
          ) : check.value.write ? (
            <label className="flex items-start gap-2">
              <input type="checkbox" name="write" defaultChecked className="mt-1" />
              <span>zapisovat poznámky k leadům a zákazníkům, nastavovat další krok u leadu a zakládat a komentovat úkoly v Živé mapě firmy</span>
            </label>
          ) : (
            <p className="text-neutral-500">Zápisy si {assistant} nevyžádal — jen čtení.</p>
          )}
          <p className="text-xs text-neutral-500">
            Nikdy: mazat, měnit role a oprávnění, objednávky, platby ani fakturaci.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button type="submit" name="decision" value="allow" className={`${BUTTON} text-begina-primary-50 bg-begina-primary-900`}>
            Povolit
          </button>
          <button type="submit" name="decision" value="deny" className={`${BUTTON} text-begina-primary-900 bg-neutral-50 border border-neutral-200`}>
            Zamítnout
          </button>
        </div>
      </form>
    </Card>
  );
}
